import {
  EventPayloadValidationError,
  isEventClass,
  validateEventPayload,
  type EventClass,
} from "./event-class.js";
import type { EventRuntime } from "./event-runtime.js";
import type { CanonicalClassId } from "./identity.js";
import { isInteractionType, type InteractionType } from "./interaction-type.js";
import { ManagedStatus } from "./managed-lifecycle.js";
import {
  projectionInteractionAccessor,
  type ProjectionRuntime,
} from "./projection-runtime.js";
import type { RootHandle } from "./renderer-port.js";
import { OwnershipError } from "./runtime-errors.js";
import type { RuntimeId } from "./identity.js";
import type { Runtime } from "./runtime.js";
import { createJsonSnapshot, type JsonObject } from "./strict-json.js";

/** Projects an inward interaction snapshot into an EventClass payload. */
export type InteractionProjection = (snapshot: JsonObject) => unknown;

/** Why a reported interaction failed at delivery time. */
export type InteractionFailureReason =
  | "non-object-snapshot"
  | "invalid-payload"
  | "projection-error"
  | "dispatch-error";

/** A typed delivery-time failure surfaced through the owned failure channel. */
export interface InteractionFailure {
  readonly root: RootHandle;
  readonly type: string;
  readonly reason: InteractionFailureReason;
  readonly cause: unknown;
}

/** Observes delivery-time interaction failures through the owned channel. */
export type InteractionFailureObserver = (failure: InteractionFailure) => void;

/** Options for the interaction-binding domain. */
export interface InteractionBindingOptions {
  /**
   * Observes delivery-time failures. With none registered, a failure is instead
   * reported through `globalThis.reportError` so it is never silently lost.
   */
  readonly onFailure?: InteractionFailureObserver;
}

/** A handle to one active `(root, interaction-type)` binding. */
export interface InteractionBindingHandle {
  readonly root: RootHandle;
  readonly type: string;
}

/**
 * The runtime-owned input contract: it maps a `(RootHandle, interaction-type)`
 * pair to an EventClass and a payload projection, owns the immutable-snapshot
 * boundary, and dispatches the mapped semantic event through the event domain.
 */
export interface InteractionBinding {
  readonly runtime: Runtime;
  /**
   * Register a typed InteractionType so it can be bound. A duplicate local slug is
   * rejected. Raw-string binds need no registration.
   */
  registerInteractionType(type: InteractionType): void;
  bind(
    root: RootHandle,
    type: InteractionType | string,
    eventClass: EventClass,
    project: InteractionProjection,
  ): InteractionBindingHandle;
  /** Await every dispatch currently in flight from a delivered interaction. */
  settled(): Promise<void>;
}

export class DuplicateInteractionRuntimeError extends Error {
  constructor() {
    super("Runtime already has an interaction-binding domain.");
    this.name = "DuplicateInteractionRuntimeError";
  }
}

/** A second InteractionType with the same local slug cannot be registered. */
export class DuplicateInteractionTypeError extends Error {
  constructor(readonly localSlug: string) {
    super(
      `InteractionType ${JSON.stringify(localSlug)} is already registered.`,
    );
    this.name = "DuplicateInteractionTypeError";
  }
}

/** An InteractionType must be registered on the domain before it can be bound. */
export class InteractionTypeNotRegisteredError extends Error {
  constructor(readonly localSlug: string) {
    super(
      `InteractionType ${JSON.stringify(localSlug)} is not registered on this interaction-binding domain.`,
    );
    this.name = "InteractionTypeNotRegisteredError";
  }
}

/** A RootHandle owned by another runtime cannot be bound. */
export class ForeignRootBindingError extends OwnershipError {
  constructor(
    expectedRuntimeId: RuntimeId,
    actualRuntimeId: RuntimeId | undefined,
  ) {
    super(expectedRuntimeId, actualRuntimeId);
    this.name = "ForeignRootBindingError";
  }
}

/** A `(root, type)` pair that is already actively bound cannot be rebound. */
export class DuplicateInteractionBindingError extends Error {
  constructor(readonly type: string) {
    super(
      `Interaction type ${JSON.stringify(type)} is already bound on this root.`,
    );
    this.name = "DuplicateInteractionBindingError";
  }
}

/** A delivered snapshot that is not an immutable JSON object is rejected. */
export class NonObjectSnapshotError extends TypeError {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Interaction snapshot rejected: ${reason}.`, options);
    this.name = "NonObjectSnapshotError";
  }
}

/** A projected payload the bound EventClass's closed schema rejects. */
export class InvalidInteractionPayloadError extends TypeError {
  constructor(
    readonly eventClassId: CanonicalClassId,
    cause: EventPayloadValidationError,
  ) {
    super(
      `Interaction projection for ${JSON.stringify(eventClassId)} produced an invalid payload.`,
      { cause },
    );
    this.name = "InvalidInteractionPayloadError";
  }
}

interface BindingEntry {
  readonly type: string;
  readonly eventClass: EventClass;
  readonly project: InteractionProjection;
  live: boolean;
}

const interactionRuntimes = new WeakMap<Runtime, InteractionBinding>();

/** Create the single interaction-binding domain for a Runtime. */
export function createInteractionBinding(
  runtime: Runtime,
  projection: ProjectionRuntime,
  events: EventRuntime,
  options: InteractionBindingOptions = {},
): InteractionBinding {
  if (interactionRuntimes.has(runtime)) {
    throw new DuplicateInteractionRuntimeError();
  }
  const domain = new DefaultInteractionBinding(
    runtime,
    projection,
    events,
    options.onFailure,
  );
  const frozen = Object.freeze(domain);
  interactionRuntimes.set(runtime, frozen);
  return frozen;
}

class DefaultInteractionBinding implements InteractionBinding {
  readonly #accessor;
  readonly #bindings = new WeakMap<RootHandle, Map<string, BindingEntry>>();
  readonly #pending = new Set<Promise<unknown>>();
  readonly #interactionTypes = new Set<InteractionType>();

  readonly #onFailure: InteractionFailureObserver | undefined;

  constructor(
    readonly runtime: Runtime,
    projection: ProjectionRuntime,
    private readonly events: EventRuntime,
    onFailure: InteractionFailureObserver | undefined,
  ) {
    this.#accessor = projectionInteractionAccessor(projection);
    this.#onFailure = onFailure;
  }

  registerInteractionType(type: InteractionType): void {
    if (!isInteractionType(type)) {
      throw new TypeError("Value is not an InteractionType.");
    }
    for (const existing of this.#interactionTypes) {
      if (existing.localSlug === type.localSlug) {
        throw new DuplicateInteractionTypeError(type.localSlug);
      }
    }
    this.#interactionTypes.add(type);
  }

  /** Resolve a bind `type` to the native event name the port listens for. A
   * registered InteractionType yields its `native`; a raw string is used as-is. */
  #resolveType(type: InteractionType | string): string {
    if (isInteractionType(type)) {
      if (!this.#interactionTypes.has(type)) {
        throw new InteractionTypeNotRegisteredError(type.localSlug);
      }
      return type.native;
    }
    if (typeof type !== "string" || type.length === 0) {
      throw new TypeError("Interaction type is not a non-empty string.");
    }
    return type;
  }

  bind(
    root: RootHandle,
    type: InteractionType | string,
    eventClass: EventClass,
    project: InteractionProjection,
  ): InteractionBindingHandle {
    // Ownership first, mirroring projection.commit: reject a foreign root before
    // touching the port.
    try {
      this.runtime.assertOwns(root);
    } catch (cause) {
      if (cause instanceof OwnershipError) {
        throw new ForeignRootBindingError(
          cause.expectedRuntimeId,
          cause.actualRuntimeId,
        );
      }
      throw cause;
    }
    root.assertActive("bind an interaction");
    if (!isEventClass(eventClass)) {
      throw new TypeError("EventClass lacks immutable helper provenance.");
    }
    if (typeof project !== "function") {
      throw new TypeError("Interaction projection is not a function.");
    }
    // Resolve to the native event name: a registered InteractionType yields its
    // `native`; a raw string is used as-is. The port stays string-typed below.
    const native = this.#resolveType(type);

    const existing = this.#bindings.get(root)?.get(native);
    if (existing?.live === true) {
      throw new DuplicateInteractionBindingError(native);
    }

    const entry: BindingEntry = {
      type: native,
      eventClass,
      project,
      live: true,
    };
    // The port registration is created before the entry is recorded, so a port
    // failure leaves no stale binding.
    this.#accessor.registerInteraction(
      root,
      native,
      (snapshot) => this.#deliver(root, entry, snapshot),
      () => {
        entry.live = false;
        this.#bindings.get(root)?.delete(native);
      },
    );
    let byType = this.#bindings.get(root);
    if (byType === undefined) {
      byType = new Map();
      this.#bindings.set(root, byType);
    }
    byType.set(native, entry);
    return Object.freeze({ root, type: native });
  }

  async settled(): Promise<void> {
    await Promise.allSettled([...this.#pending]);
  }

  #deliver(root: RootHandle, entry: BindingEntry, rawSnapshot: unknown): void {
    // Liveness FIRST: a delivery that races release (root already disposing, or
    // the entry already dropped) surfaces neither an event nor a failure, so
    // normal teardown raises no error report.
    if (!entry.live || root.status !== ManagedStatus.Active) return;

    // The inward boundary: only an immutable JSON object may cross. Reject
    // anything else (a function, a live node, a primitive) with no dispatch,
    // routing the failure to the owned channel rather than throwing out of the
    // adapter's swallowing event callback.
    if (!isPlainObject(rawSnapshot)) {
      this.#report({
        root,
        type: entry.type,
        reason: "non-object-snapshot",
        cause: new NonObjectSnapshotError(
          "snapshot is not a plain JSON object",
        ),
      });
      return;
    }
    let snapshot: JsonObject;
    try {
      // Normalize to a deeply frozen JSON copy; core never sees the adapter's
      // live reference and rejects any non-JSON content.
      snapshot = createJsonSnapshot<JsonObject>(rawSnapshot).value;
    } catch (cause) {
      this.#report({
        root,
        type: entry.type,
        reason: "non-object-snapshot",
        cause: new NonObjectSnapshotError(
          "snapshot is not immutable JSON data",
          { cause },
        ),
      });
      return;
    }

    let payload: unknown;
    try {
      payload = entry.project(snapshot);
    } catch (cause) {
      // A throwing projection is a delivery-time failure, not an escape hatch.
      this.#report({
        root,
        type: entry.type,
        reason: "projection-error",
        cause,
      });
      return;
    }

    try {
      // Fail before dispatch so no partially-populated event is created.
      validateEventPayload(entry.eventClass, payload);
    } catch (cause) {
      // Any validation throw is a delivery-time failure: wrap the expected
      // payload-rejection in InvalidInteractionPayloadError, and route any other
      // throw as its own cause so nothing escapes synchronously into the adapter.
      this.#report({
        root,
        type: entry.type,
        reason: "invalid-payload",
        cause:
          cause instanceof EventPayloadValidationError
            ? new InvalidInteractionPayloadError(entry.eventClass.id, cause)
            : cause,
      });
      return;
    }

    const dispatch = this.events.dispatch(entry.eventClass.id, payload);
    // Track the dispatch — including its failure routing — so settled() awaits
    // it and a rejection is reported through the channel, not discarded.
    const tracked = dispatch.then(undefined, (cause: unknown) => {
      // A dispatch-error is async and can settle after release: re-check
      // liveness so a dispatch racing teardown is suppressed, not surfaced.
      if (entry.live && root.status === ManagedStatus.Active) {
        this.#report({
          root,
          type: entry.type,
          reason: "dispatch-error",
          cause,
        });
      }
    });
    this.#pending.add(tracked);
    const settle = (): void => {
      this.#pending.delete(tracked);
    };
    void tracked.then(settle, settle);
  }

  #report(failure: InteractionFailure): void {
    const observer = this.#onFailure;
    if (observer !== undefined) {
      try {
        observer(failure);
      } catch (observerError) {
        // A throwing observer is contained and escalated to the default
        // reporter, never re-entering the adapter's event callback.
        reportUnobserved(coerceError(observerError));
      }
      return;
    }
    // Never silently lost: with no observer, report through the default reporter
    // without an uncaught throw (swallow-safe inside the adapter's callback).
    reportUnobserved(asError(failure));
  }
}

/**
 * Report an unobserved delivery-time failure without ever throwing out of the
 * delivery callback: prefer the global `reportError` when the host provides it,
 * fall back to `console.error` (always present) otherwise, and swallow any throw
 * from the reporter itself — a reporter of last resort must never escape.
 */
function reportUnobserved(error: Error): void {
  const host = globalThis as {
    reportError?: unknown;
    console?: { error(value: unknown): void };
  };
  try {
    if (typeof host.reportError === "function") {
      (host.reportError as (value: unknown) => void)(error);
    } else {
      host.console?.error(error);
    }
  } catch {
    // The reporter of last resort itself must never throw back into the caller.
  }
}

/** Wrap a failure as an Error carrying the original cause, for reportError. */
function asError(failure: InteractionFailure): Error {
  return new Error(
    `Interaction ${JSON.stringify(failure.type)} failed (${failure.reason}).`,
    { cause: failure.cause },
  );
}

/** Coerce an arbitrary thrown value into an Error for reportError. */
function coerceError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error(String(value), { cause: value });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
