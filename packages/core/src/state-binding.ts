import { ManagedStatus } from "./managed-lifecycle.js";
import type { ProjectionRuntime } from "./projection-runtime.js";
import type { RootHandle } from "./renderer-port.js";
import type { Runtime } from "./runtime.js";
import type { StateHandle, StateSubscription } from "./state-runtime.js";
import type { JsonValue } from "./strict-json.js";
import type { RenderNode } from "./template-class.js";

/** Derives the node to project for a root from the bound state's value. */
export type StateDerivation<T extends JsonValue = JsonValue> = (
  value: T,
) => RenderNode;

/** A handle to one active `(root, state)` binding. */
export interface StateBindingHandle {
  readonly root: RootHandle;
  /** Stop committing on state changes. Idempotent. */
  release(): void;
}

/**
 * The output-side coordinator, symmetric to interaction-binding: it maps a
 * `StateHandle` value to a `RenderNode` and drives `projection.commit` on the
 * bound root whenever the state changes. The derivation and this contract expose
 * no renderer-native or reactive-library type; the only reactivity is the
 * state's own observation.
 */
export interface StateBinding {
  readonly runtime: Runtime;
  bind<T extends JsonValue>(
    root: RootHandle,
    state: StateHandle<T>,
    derive: StateDerivation<T>,
  ): StateBindingHandle;
}

export class DuplicateStateBindingRuntimeError extends Error {
  constructor() {
    super("Runtime already has a state-binding domain.");
    this.name = "DuplicateStateBindingRuntimeError";
  }
}

/** A root that already has a live state binding cannot be rebound. */
export class RootAlreadyBoundError extends Error {
  constructor() {
    super("Root already has a live state binding.");
    this.name = "RootAlreadyBoundError";
  }
}

const stateBindings = new WeakMap<Runtime, StateBinding>();

/** Create the single state-binding domain for a Runtime. */
export function createStateBinding(
  runtime: Runtime,
  projection: ProjectionRuntime,
): StateBinding {
  if (stateBindings.has(runtime)) {
    throw new DuplicateStateBindingRuntimeError();
  }
  const domain = new DefaultStateBinding(runtime, projection);
  const frozen = Object.freeze(domain);
  stateBindings.set(runtime, frozen);
  return frozen;
}

class DefaultStateBinding implements StateBinding {
  readonly #boundRoots = new WeakSet<RootHandle>();

  constructor(
    readonly runtime: Runtime,
    private readonly projection: ProjectionRuntime,
  ) {}

  bind<T extends JsonValue>(
    root: RootHandle,
    state: StateHandle<T>,
    derive: StateDerivation<T>,
  ): StateBindingHandle {
    this.runtime.assertOwns(root);
    this.runtime.assertOwns(state);
    root.assertActive("bind state to a root");
    state.assertActive("bind a root to state");
    if (typeof derive !== "function") {
      throw new TypeError("State derivation is not a function.");
    }
    if (this.#boundRoots.has(root)) {
      throw new RootAlreadyBoundError();
    }

    let live = true;
    let subscription: StateSubscription | undefined;
    const stop = (): void => {
      if (!live) return;
      live = false;
      subscription?.remove();
      this.#boundRoots.delete(root);
    };

    const apply = (value: T): void => {
      if (!live) return;
      // A change delivered after the root is released must not commit; drop the
      // now-dead observation instead (self-healing teardown).
      if (root.status !== ManagedStatus.Active) {
        stop();
        return;
      }
      this.projection.commit(root, derive(value));
    };

    // Sync the view to the current state before observing, so a throwing
    // initial derivation registers no observer and leaves the root unbound.
    apply(state.read());

    // The root was asserted active above, so the initial apply keeps the
    // binding live; observe only then, guarding the invariant explicitly.
    if (live) {
      this.#boundRoots.add(root);
      subscription = state.observe(apply);
    }

    return Object.freeze({
      root,
      release: stop,
    });
  }
}
