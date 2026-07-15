import { isEventClass, type EventClass } from "./event-class.js";
import type { EventChannel, EventEndpoint } from "./event-endpoint.js";
import type { EventInstance } from "./event-instance.js";
import {
  createCanonicalClassId,
  createLocalClassSlug,
  type CanonicalClassId,
  type LocalClassSlug,
} from "./identity.js";
import type { ManagedObject } from "./managed-lifecycle.js";

export interface ListenerInstance extends ManagedObject {
  readonly installationSequence: number;
}

export interface ListenerContext {
  readonly event: EventInstance;
  readonly endpoint: EventEndpoint;
  readonly channel: EventChannel;
  readonly listener: ListenerInstance;
}

export type ListenerResult = undefined | false;
export type ListenerCallback = (
  context: ListenerContext,
) => ListenerResult | Promise<ListenerResult>;

export interface ListenerMiddlewareOutcome {
  readonly status: "completed" | "short-circuited" | "failed";
  readonly cause?: unknown;
}

export type ListenerBefore = (
  context: ListenerContext,
) => ListenerResult | Promise<ListenerResult>;
export type ListenerAfter = (
  context: ListenerContext,
  outcome: ListenerMiddlewareOutcome,
) => undefined | Promise<undefined>;

export interface ListenerMiddleware {
  readonly before?: ListenerBefore;
  readonly after?: ListenerAfter;
}

export interface ListenerClass {
  readonly id: CanonicalClassId;
  readonly localSlug: LocalClassSlug;
  readonly eventClass: EventClass;
  readonly callback: ListenerCallback;
  readonly middleware: readonly ListenerMiddleware[];
}

const middlewareDefinitions = new WeakSet<object>();
const listenerClasses = new WeakSet<object>();
const MAX_LISTENER_MIDDLEWARE = 100;

export class ListenerDefinitionError extends TypeError {
  constructor(readonly reason: string) {
    super(`Invalid listener definition: ${reason}.`);
    this.name = "ListenerDefinitionError";
  }
}

export class ListenerReturnContractError extends TypeError {
  constructor(readonly phase: "before" | "callback" | "after") {
    super(`Listener ${phase} hook returned a value outside its contract.`);
    this.name = "ListenerReturnContractError";
  }
}

export class ListenerExecutionError extends Error {
  readonly afterFailures: readonly unknown[];
  constructor(
    readonly primaryCause: unknown,
    afterFailures: readonly unknown[],
  ) {
    super("Listener execution failed.", {
      cause: primaryCause ?? afterFailures[0],
    });
    this.name = "ListenerExecutionError";
    this.afterFailures = Object.freeze([...afterFailures]);
  }
}

export function createListenerMiddleware(options: {
  readonly before?: ListenerBefore;
  readonly after?: ListenerAfter;
}): ListenerMiddleware {
  if (typeof options !== "object" || options === null) {
    throw new ListenerDefinitionError("middleware options are not an object");
  }
  if (Object.getOwnPropertySymbols(options).length > 0) {
    throw new ListenerDefinitionError("middleware options contain symbol keys");
  }
  const descriptors = Object.getOwnPropertyDescriptors(options);
  for (const key of Object.keys(descriptors)) {
    if (key !== "before" && key !== "after") {
      throw new ListenerDefinitionError(`unknown middleware option ${key}`);
    }
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
      throw new ListenerDefinitionError(
        `middleware ${key} is not enumerable data`,
      );
    }
  }
  const before: unknown = descriptors.before?.value;
  const after: unknown = descriptors.after?.value;
  if (before !== undefined && typeof before !== "function") {
    throw new ListenerDefinitionError(
      "middleware before hook is not a function",
    );
  }
  if (after !== undefined && typeof after !== "function") {
    throw new ListenerDefinitionError(
      "middleware after hook is not a function",
    );
  }
  const middleware = {
    ...(before === undefined ? {} : { before: before as ListenerBefore }),
    ...(after === undefined ? {} : { after: after as ListenerAfter }),
  };
  middlewareDefinitions.add(middleware);
  return Object.freeze(middleware);
}

export function createListenerClass(
  slug: string,
  eventClass: EventClass,
  callback: ListenerCallback,
  middleware: Iterable<ListenerMiddleware> = [],
): ListenerClass {
  if (!isEventClass(eventClass)) {
    throw new ListenerDefinitionError("EventClass lacks helper provenance");
  }
  if (typeof callback !== "function") {
    throw new ListenerDefinitionError("callback is not a function");
  }
  const copied: ListenerMiddleware[] = [];
  for (const item of middleware) {
    if (copied.length === MAX_LISTENER_MIDDLEWARE) {
      throw new ListenerDefinitionError(
        `middleware exceeds ${MAX_LISTENER_MIDDLEWARE} items`,
      );
    }
    if (!middlewareDefinitions.has(item) || !Object.isFrozen(item)) {
      throw new ListenerDefinitionError("middleware lacks helper provenance");
    }
    copied.push(item);
  }
  const localSlug = createLocalClassSlug(slug);
  const definition = {
    id: createCanonicalClassId("listener", localSlug),
    localSlug,
    eventClass,
    callback,
    middleware: Object.freeze(copied),
  };
  listenerClasses.add(definition);
  return Object.freeze(definition);
}

export function isListenerClass(value: unknown): value is ListenerClass {
  return (
    typeof value === "object" &&
    value !== null &&
    listenerClasses.has(value) &&
    Object.isFrozen(value)
  );
}

export async function executeListener(
  listenerClass: ListenerClass,
  context: ListenerContext,
): Promise<boolean> {
  if (!isListenerClass(listenerClass)) {
    throw new ListenerDefinitionError("ListenerClass lacks helper provenance");
  }
  const frozenContext = Object.freeze({ ...context });
  const entered: ListenerMiddleware[] = [];
  let shortCircuited = false;
  let primaryFailed = false;
  let primaryCause: unknown;

  for (const middleware of listenerClass.middleware) {
    try {
      const result = await middleware.before?.(frozenContext);
      assertBeforeOrCallbackResult(result, "before");
      entered.push(middleware);
      if (result === false) {
        shortCircuited = true;
        break;
      }
    } catch (cause) {
      primaryFailed = true;
      primaryCause = cause;
      break;
    }
  }

  if (!primaryFailed && !shortCircuited) {
    try {
      const result = await listenerClass.callback(frozenContext);
      assertBeforeOrCallbackResult(result, "callback");
      shortCircuited = result === false;
    } catch (cause) {
      primaryFailed = true;
      primaryCause = cause;
    }
  }

  const outcome = Object.freeze({
    status: primaryFailed
      ? ("failed" as const)
      : shortCircuited
        ? ("short-circuited" as const)
        : ("completed" as const),
    ...(primaryFailed ? { cause: primaryCause } : {}),
  });
  const afterFailures: unknown[] = [];
  for (const middleware of entered.reverse()) {
    if (middleware.after === undefined) continue;
    try {
      const result: unknown = await middleware.after(frozenContext, outcome);
      if (result !== undefined) throw new ListenerReturnContractError("after");
    } catch (cause) {
      afterFailures.push(cause);
    }
  }

  if (primaryFailed || afterFailures.length > 0) {
    throw new ListenerExecutionError(primaryCause, afterFailures);
  }
  return shortCircuited;
}

function assertBeforeOrCallbackResult(
  result: unknown,
  phase: "before" | "callback",
): asserts result is ListenerResult {
  if (result !== undefined && result !== false) {
    throw new ListenerReturnContractError(phase);
  }
}
