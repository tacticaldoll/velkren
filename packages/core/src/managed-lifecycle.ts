import type { CanonicalClassId, ManagedInstanceId } from "./identity.js";
import { LifecycleError, ManagedReleaseError } from "./runtime-errors.js";
import {
  markRuntimeOwned,
  type Runtime,
  type RuntimeOwned,
} from "./runtime.js";

export const ManagedStatus = {
  Active: "active",
  Disposing: "disposing",
  Released: "released",
} as const;

export type ManagedStatus = (typeof ManagedStatus)[keyof typeof ManagedStatus];

export interface ManagedTombstone<Id extends string = ManagedInstanceId> {
  readonly id: Id;
  readonly classId: CanonicalClassId;
  readonly status: typeof ManagedStatus.Released;
  readonly releasedAt: number;
  readonly releaseFailed: boolean;
}

export interface ManagedObject<
  Id extends string = ManagedInstanceId,
> extends RuntimeOwned {
  readonly id: Id;
  readonly classId: CanonicalClassId;
  readonly status: ManagedStatus;
  readonly tombstone: ManagedTombstone<Id> | undefined;
  assertActive(operation: string): void;
  release(): Promise<void>;
}

export type ManagedCleanup = () => void | Promise<void>;

interface ManagedObjectState<Id extends string> {
  readonly cleanups: ManagedCleanup[];
  status: ManagedStatus;
  tombstone?: ManagedTombstone<Id>;
  releasePromise?: Promise<void>;
}

const managedState = new WeakMap<
  DefaultManagedObject<string>,
  ManagedObjectState<string>
>();

class DefaultManagedObject<Id extends string> {
  readonly id: Id;
  readonly classId: CanonicalClassId;

  constructor(id: Id, classId: CanonicalClassId) {
    this.id = id;
    this.classId = classId;
  }

  get status(): ManagedStatus {
    return getManagedState(this).status;
  }

  get tombstone(): ManagedTombstone<Id> | undefined {
    return getManagedState(this).tombstone;
  }

  assertActive(operation: string): void {
    const { status } = getManagedState(this);
    if (status !== ManagedStatus.Active) {
      throw new LifecycleError(this.id, status, operation);
    }
  }

  release(): Promise<void> {
    const state = getManagedState(this);
    if (state.releasePromise !== undefined) {
      return state.releasePromise;
    }

    state.status = ManagedStatus.Disposing;
    state.releasePromise = releaseManagedObject(this, state);
    return state.releasePromise;
  }
}

export interface ManagedObjectController<
  Id extends string = ManagedInstanceId,
> {
  readonly object: ManagedObject<Id>;
  readonly addCleanup: (cleanup: ManagedCleanup) => void;
}

export function createManagedObject(
  runtime: Runtime,
  id: ManagedInstanceId,
  classId: CanonicalClassId,
): ManagedObjectController {
  return createManagedResource(runtime, id, classId);
}

export function createManagedResource<Id extends string>(
  runtime: Runtime,
  id: Id,
  classId: CanonicalClassId,
): ManagedObjectController<Id> {
  const managedObject = new DefaultManagedObject(id, classId);
  const object = markRuntimeOwned(runtime, managedObject);
  const state: ManagedObjectState<Id> = {
    cleanups: [],
    status: ManagedStatus.Active,
  };
  managedState.set(object, state);

  return {
    object,
    addCleanup(cleanup) {
      object.assertActive("register a cleanup resource");
      state.cleanups.push(cleanup);
    },
  };
}

function getManagedState<Id extends string>(
  object: DefaultManagedObject<Id>,
): ManagedObjectState<Id> {
  const state = managedState.get(object);
  if (state === undefined) {
    throw new TypeError("Managed object was not created by Velkren.");
  }
  return state as ManagedObjectState<Id>;
}

async function releaseManagedObject<Id extends string>(
  object: DefaultManagedObject<Id>,
  state: ManagedObjectState<Id>,
): Promise<void> {
  const failures: unknown[] = [];
  for (const cleanup of state.cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  state.cleanups.length = 0;
  state.status = ManagedStatus.Released;
  state.tombstone = Object.freeze({
    id: object.id,
    classId: object.classId,
    status: ManagedStatus.Released,
    releasedAt: Date.now(),
    releaseFailed: failures.length > 0,
  });

  if (failures.length > 0) {
    throw new ManagedReleaseError(object.id, object.classId, failures);
  }
}
