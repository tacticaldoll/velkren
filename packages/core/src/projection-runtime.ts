import type { ComponentInstance } from "./component-class.js";
import { createManagedInstanceId, type ManagedInstanceId } from "./identity.js";
import { createManagedResource, ManagedStatus } from "./managed-lifecycle.js";
import { ManagedReleaseError } from "./runtime-errors.js";
import type { Runtime } from "./runtime.js";
import {
  assertRendererPort,
  ProjectionError,
  type AdapterRoot,
  type Projection,
  type RendererPort,
  type RootHandle,
} from "./renderer-port.js";
import type { RenderNode, RenderPlan } from "./template-class.js";

/** The projection domain: mounts render plans onto one renderer surface. */
export interface ProjectionRuntime {
  readonly runtime: Runtime;
  mount(instance: ComponentInstance, plan: RenderPlan): Promise<Projection>;
  commit(root: RootHandle, node: RenderNode): void;
}

interface RootState {
  readonly port: RendererPort;
  readonly adapterRoot: AdapterRoot;
  readonly identity: string;
  readonly rootName: string;
}

const rootStates = new WeakMap<RootHandle, RootState>();
const runtimeRootSequences = new WeakMap<Runtime, number>();

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
  ) {}

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
