import type { ComponentInstance } from "./component-class.js";
import { createManagedInstanceId, type ManagedInstanceId } from "./identity.js";
import {
  createManagedResource,
  ManagedStatus,
  type ManagedCleanup,
} from "./managed-lifecycle.js";
import { ManagedReleaseError } from "./runtime-errors.js";
import type { Runtime } from "./runtime.js";
import {
  assertRendererPort,
  ProjectionError,
  type AdapterRoot,
  type InteractionRegistration,
  type Projection,
  type RendererPort,
  type RootHandle,
} from "./renderer-port.js";
import type { JsonObject } from "./strict-json.js";
import type { RenderNode, RenderPlan } from "./template-class.js";

/** The projection domain: mounts render plans onto one renderer surface. */
export interface ProjectionRuntime {
  readonly runtime: Runtime;
  mount(instance: ComponentInstance, plan: RenderPlan): Promise<Projection>;
  commit(root: RootHandle, node: RenderNode): void;
}

/**
 * A controlled, package-internal bridge the interaction-binding domain uses to
 * reach an owned root's adapter root and port without `rootStates` leaking. It
 * is intentionally not part of the public barrel.
 */
export interface ProjectionInteractionAccessor {
  registerInteraction(
    root: RootHandle,
    type: string,
    deliver: (snapshot: JsonObject) => void,
    onRelease: () => void,
  ): InteractionRegistration;
}

interface RootState {
  readonly port: RendererPort;
  readonly adapterRoot: AdapterRoot;
  readonly identity: string;
  readonly rootName: string;
  readonly addCleanup: (cleanup: ManagedCleanup) => void;
}

const rootStates = new WeakMap<RootHandle, RootState>();
const runtimeRootSequences = new WeakMap<Runtime, number>();
const projectionAccessors = new WeakMap<
  ProjectionRuntime,
  ProjectionInteractionAccessor
>();

/**
 * Resolve the controlled interaction accessor for a projection runtime. Used by
 * the interaction-binding domain; not exported from the public barrel.
 */
export function projectionInteractionAccessor(
  projection: ProjectionRuntime,
): ProjectionInteractionAccessor {
  const accessor = projectionAccessors.get(projection);
  if (accessor === undefined) {
    throw new TypeError("ProjectionRuntime was not created by Velkren.");
  }
  return accessor;
}

/** Create a projection domain over a Runtime and a renderer port. */
export function createProjectionRuntime(
  runtime: Runtime,
  renderer: unknown,
): ProjectionRuntime {
  assertRendererPort(renderer);
  return new DefaultProjectionRuntime(runtime, renderer);
}

class DefaultProjectionRuntime implements ProjectionRuntime {
  constructor(
    readonly runtime: Runtime,
    readonly renderer: RendererPort,
  ) {
    projectionAccessors.set(this, {
      registerInteraction: (root, type, deliver, onRelease) =>
        this.#registerInteraction(root, type, deliver, onRelease),
    });
  }

  async mount(
    instance: ComponentInstance,
    plan: RenderPlan,
  ): Promise<Projection> {
    this.runtime.assertOwns(instance);
    instance.assertActive("project a render plan");

    const created: RootHandle[] = [];
    try {
      for (const [rootName, node] of Object.entries(plan.roots)) {
        created.push(this.#createRoot(instance.classId, rootName, node));
      }
    } catch (cause) {
      // Roll back any roots created before the failure; no partial projection.
      await releaseAll(created).catch(() => undefined);
      throw cause;
    }

    const roots: Record<string, RootHandle> = {};
    for (const handle of created) roots[handle.rootName] = handle;

    const controller = createManagedResource<ManagedInstanceId>(
      this.runtime,
      this.#nextId("projection"),
      instance.classId,
    );
    const projection = controller.object as unknown as Projection;
    controller.addCleanup(() => releaseAll(created));
    Object.defineProperties(projection, {
      instanceId: { enumerable: true, value: instance.id },
      roots: { enumerable: true, value: Object.freeze(roots) },
    });
    return projection;
  }

  commit(root: RootHandle, node: RenderNode): void {
    this.runtime.assertOwns(root);
    root.assertActive("commit a render node");
    const state = this.#stateOf(root);
    state.port.commit(state.adapterRoot, state.identity, node);
    // Managed repair: the identity must be present after every commit.
    if (state.port.readIdentity(state.adapterRoot) !== state.identity) {
      throw new ProjectionError(
        `renderer did not preserve identity for root ${JSON.stringify(root.rootName)}`,
      );
    }
  }

  #createRoot(
    classId: ComponentInstance["classId"],
    rootName: string,
    node: RenderNode,
  ): RootHandle {
    const controller = createManagedResource<ManagedInstanceId>(
      this.runtime,
      this.#nextId("render-root"),
      classId,
    );
    const handle = controller.object as unknown as RootHandle;
    const identity = handle.id;
    const adapterRoot = this.renderer.createRoot(identity, node);
    rootStates.set(handle, {
      port: this.renderer,
      adapterRoot,
      identity,
      rootName,
      addCleanup: (cleanup) => controller.addCleanup(cleanup),
    });
    controller.addCleanup(() => this.renderer.removeRoot(adapterRoot));
    controller.addCleanup(() => {
      rootStates.delete(handle);
    });
    Object.defineProperties(handle, {
      rootName: { enumerable: true, value: rootName },
      identity: { enumerable: true, value: identity },
    });
    return handle;
  }

  #registerInteraction(
    root: RootHandle,
    type: string,
    deliver: (snapshot: JsonObject) => void,
    onRelease: () => void,
  ): InteractionRegistration {
    this.runtime.assertOwns(root);
    root.assertActive("register an interaction");
    const state = this.#stateOf(root);
    const registration = state.port.registerInteraction(
      state.adapterRoot,
      type,
      deliver,
    );
    // Bind removal to the root lifecycle: releasing the root unwires the port
    // registration and marks the binding dead.
    state.addCleanup(() => {
      onRelease();
      registration.remove();
    });
    return registration;
  }

  #stateOf(root: RootHandle): RootState {
    const state = rootStates.get(root);
    if (state === undefined) {
      throw new TypeError("RootHandle was not created by this projection.");
    }
    return state;
  }

  #nextId(kind: string): ManagedInstanceId {
    const next = (runtimeRootSequences.get(this.runtime) ?? 0) + 1;
    runtimeRootSequences.set(this.runtime, next);
    return createManagedInstanceId(this.runtime.id, kind, `node-${next}`);
  }
}

async function releaseAll(handles: readonly RootHandle[]): Promise<void> {
  const failures: unknown[] = [];
  for (const handle of [...handles].reverse()) {
    if (handle.status !== ManagedStatus.Active) continue;
    try {
      await handle.release();
    } catch (error) {
      if (error instanceof ManagedReleaseError)
        failures.push(...error.failures);
      else failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Projection root release failed.");
  }
}
