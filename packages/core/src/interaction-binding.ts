import {
  EventPayloadValidationError,
  isEventClass,
  validateEventPayload,
  type EventClass,
} from "./event-class.js";
import type { EventRuntime } from "./event-runtime.js";
import type { CanonicalClassId } from "./identity.js";
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
  bind(
    root: RootHandle,
    type: string,
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
): InteractionBinding {
  if (interactionRuntimes.has(runtime)) {
    throw new DuplicateInteractionRuntimeError();
  }
  const domain = new DefaultInteractionBinding(runtime, projection, events);
  const frozen = Object.freeze(domain);
  interactionRuntimes.set(runtime, frozen);
  return frozen;
}

class DefaultInteractionBinding implements InteractionBinding {
  readonly #accessor;
  readonly #bindings = new WeakMap<RootHandle, Map<string, BindingEntry>>();
  readonly #pending = new Set<Promise<unknown>>();

  constructor(
    readonly runtime: Runtime,
    projection: ProjectionRuntime,
    private readonly events: EventRuntime,
  ) {
    this.#accessor = projectionInteractionAccessor(projection);
  }

  bind(
    root: RootHandle,
    type: string,
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
    if (typeof type !== "string" || type.length === 0) {
      throw new TypeError("Interaction type is not a non-empty string.");
    }

    const existing = this.#bindings.get(root)?.get(type);
    if (existing?.live === true) {
      throw new DuplicateInteractionBindingError(type);
    }

    const entry: BindingEntry = { eventClass, project, live: true };
    // The port registration is created before the entry is recorded, so a port
    // failure leaves no stale binding.
    this.#accessor.registerInteraction(
      root,
      type,
      (snapshot) => this.#deliver(root, entry, snapshot),
      () => {
        entry.live = false;
        this.#bindings.get(root)?.delete(type);
      },
    );
    let byType = this.#bindings.get(root);
    if (byType === undefined) {
      byType = new Map();
      this.#bindings.set(root, byType);
    }
    byType.set(type, entry);
    return Object.freeze({ root, type });
  }

  async settled(): Promise<void> {
    await Promise.allSettled([...this.#pending]);
  }

  #deliver(root: RootHandle, entry: BindingEntry, rawSnapshot: unknown): void {
    // The inward boundary: only an immutable JSON object may cross. Reject
    // anything else (a function, a live node, a primitive) with no dispatch.
    if (!isPlainObject(rawSnapshot)) {
      throw new NonObjectSnapshotError("snapshot is not a plain JSON object");
    }
    let snapshot: JsonObject;
    try {
      // Normalize to a deeply frozen JSON copy; core never sees the adapter's
      // live reference and rejects any non-JSON content.
      snapshot = createJsonSnapshot<JsonObject>(rawSnapshot).value;
    } catch (cause) {
      throw new NonObjectSnapshotError("snapshot is not immutable JSON data", {
        cause,
      });
    }

    // Re-check liveness at delivery time: a delivery that races release (root
    // already disposing, or the entry already dropped) dispatches nothing.
    if (!entry.live || root.status !== ManagedStatus.Active) return;

    const payload = entry.project(snapshot);
    try {
      // Fail loudly before dispatch so no partially-populated event is created.
      validateEventPayload(entry.eventClass, payload);
    } catch (cause) {
      if (cause instanceof EventPayloadValidationError) {
        throw new InvalidInteractionPayloadError(entry.eventClass.id, cause);
      }
      throw cause;
    }

    const dispatch = this.events.dispatch(entry.eventClass.id, payload);
    this.#pending.add(dispatch);
    const settle = (): void => {
      this.#pending.delete(dispatch);
    };
    void dispatch.then(settle, settle);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
