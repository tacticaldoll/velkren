import {
  createCanonicalClassId,
  createManagedInstanceId,
  type ManagedInstanceId,
} from "./identity.js";
import {
  createManagedResource,
  type ManagedObject,
} from "./managed-lifecycle.js";
import type { Runtime } from "./runtime.js";
import { createJsonSnapshot, type JsonValue } from "./strict-json.js";

/** Observes a state value after each update. */
export type StateObserver<T extends JsonValue = JsonValue> = (value: T) => void;

/** A removable registration of a {@link StateObserver}. */
export interface StateSubscription {
  remove(): void;
}

/**
 * A runtime-owned managed cell holding a frozen strict-JSON value. It is updated
 * only through the explicit `update` operation and notifies observers
 * synchronously; possession of the live, owner-validated handle authorizes the
 * update. No renderer-native or reactive-library type appears in its contract.
 */
export interface StateHandle<
  T extends JsonValue = JsonValue,
> extends ManagedObject {
  /** The current frozen value. Fails active-only after release. */
  read(): T;
  /**
   * Store a new value and notify observers. `next` is the new value or a
   * function receiving the current frozen value and returning the next value.
   * The value is normalized to frozen strict JSON and stored as authoritative
   * before observers run; a non-JSON value is rejected without effect.
   */
  update(next: T | ((previous: T) => T)): T;
  /** Register an observer for subsequent updates. */
  observe(observer: StateObserver<T>): StateSubscription;
}

/** The managed-state domain composed onto one Runtime. */
export interface StateRuntime {
  readonly runtime: Runtime;
  create<T extends JsonValue>(initial: T): StateHandle<T>;
}

export class DuplicateStateRuntimeError extends Error {
  constructor() {
    super("Runtime already has a state domain.");
    this.name = "DuplicateStateRuntimeError";
  }
}

/** A value that is not strict JSON cannot be stored as state. */
export class InvalidStateValueError extends TypeError {
  constructor(cause: unknown) {
    super("State value is not strict JSON.", { cause });
    this.name = "InvalidStateValueError";
  }
}

const STATE_CELL_CLASS_ID = createCanonicalClassId("state", "cell");

const stateRuntimes = new WeakMap<Runtime, StateRuntime>();

/** Create the single managed-state domain for a Runtime. */
export function createStateRuntime(runtime: Runtime): StateRuntime {
  if (stateRuntimes.has(runtime)) {
    throw new DuplicateStateRuntimeError();
  }
  const domain = new DefaultStateRuntime(runtime);
  stateRuntimes.set(runtime, domain);
  return domain;
}

/** Normalize to frozen strict JSON, rejecting a non-JSON value. */
function toStateValue<T extends JsonValue>(value: T): T {
  try {
    return createJsonSnapshot<T>(value).value;
  } catch (cause) {
    throw new InvalidStateValueError(cause);
  }
}

class DefaultStateRuntime implements StateRuntime {
  #sequence = 0;

  constructor(readonly runtime: Runtime) {}

  create<T extends JsonValue>(initial: T): StateHandle<T> {
    // Validate the initial value before allocating a managed resource, so a
    // rejected value leaves no released-on-failure handle behind.
    const initialValue = toStateValue(initial);

    this.#sequence += 1;
    const controller = createManagedResource<ManagedInstanceId>(
      this.runtime,
      createManagedInstanceId(
        this.runtime.id,
        "state",
        `cell-${this.#sequence}`,
      ),
      STATE_CELL_CLASS_ID,
    );
    const handle = controller.object as StateHandle<T>;

    // The value lives behind a cleared-on-release cell so a released handle
    // retains no reference to its value; observers are dropped on release too.
    let held: { value: T } | undefined = { value: initialValue };
    const observers: StateObserver<T>[] = [];
    controller.addCleanup(() => {
      observers.length = 0;
      held = undefined;
    });

    const read = (): T => {
      handle.assertActive("read state");
      return (held as { value: T }).value;
    };

    const update = (next: T | ((previous: T) => T)): T => {
      handle.assertActive("update state");
      const previous = (held as { value: T }).value;
      const proposed = typeof next === "function" ? next(previous) : next;
      // Store the new frozen value as authoritative BEFORE notifying, so state
      // stays consistent even if an observer reads it (or throws) mid-notify.
      const value = toStateValue(proposed);
      (held as { value: T }).value = value;
      // Notify a snapshot of the observer list so a subscribe/remove during
      // notification does not disturb this round. A throwing observer neither
      // stops the others nor corrupts state; collected throws surface after all
      // observers run rather than being silently swallowed.
      const failures: unknown[] = [];
      for (const observer of [...observers]) {
        try {
          observer(value);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          "State observer(s) threw during update.",
        );
      }
      return value;
    };

    const observe = (observer: StateObserver<T>): StateSubscription => {
      handle.assertActive("observe state");
      if (typeof observer !== "function") {
        throw new TypeError("State observer is not a function.");
      }
      observers.push(observer);
      return {
        remove(): void {
          const index = observers.indexOf(observer);
          if (index !== -1) observers.splice(index, 1);
        },
      };
    };

    Object.defineProperties(handle, {
      read: { enumerable: true, value: read },
      update: { enumerable: true, value: update },
      observe: { enumerable: true, value: observe },
    });
    return handle;
  }
}
