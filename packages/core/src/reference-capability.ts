import {
  createCanonicalClassId,
  createManagedInstanceId,
  type CanonicalClassId,
  type ManagedInstanceId,
} from "./identity.js";
import {
  createManagedResource,
  type ManagedCleanup,
  type ManagedObject,
  type ManagedStatus,
  type ManagedTombstone,
} from "./managed-lifecycle.js";
import {
  markRuntimeOwned,
  type Runtime,
  type RuntimeOwned,
} from "./runtime.js";

declare const referenceTargetBrand: unique symbol;

/**
 * A public, owner-validated capability. It carries a readable diagnostic
 * identity but grants use only: it exposes neither the guarded target nor any
 * private control operation such as release.
 */
export interface ReferenceCapability<T = unknown> extends RuntimeOwned {
  readonly id: ManagedInstanceId;
  readonly classId: CanonicalClassId;
  readonly status: ManagedStatus;
  readonly tombstone: ManagedTombstone | undefined;
  /** Phantom carrier for the guarded target type; never present at runtime. */
  readonly [referenceTargetBrand]?: T;
  assertActive(operation: string): void;
}

/**
 * The private handle for a capability. It grants control operations: releasing
 * the capability and registering cleanups. It is the only path to release.
 */
export interface PrivateReferenceCapability<T = unknown> extends RuntimeOwned {
  readonly reference: ReferenceCapability<T>;
  addCleanup(cleanup: ManagedCleanup): void;
  release(): Promise<void>;
}

export interface ReferenceCapabilityPair<T = unknown> {
  readonly reference: ReferenceCapability<T>;
  readonly handle: PrivateReferenceCapability<T>;
}

/**
 * The domain identity a consumer supplies for a capability. The runtime, not
 * the caller, owns the runtime portion of the instance id, so the readable
 * identity always reflects the true owner (matching how existing domains name
 * their managed instances).
 */
export interface ReferenceCapabilityIdentity {
  readonly kind: string;
  readonly localSlug: string;
  readonly localId: string;
}

export class InvalidReferenceCapabilityError extends TypeError {
  constructor() {
    super("Reference capability lacks framework provenance.");
    this.name = "InvalidReferenceCapabilityError";
  }
}

interface ReferenceState {
  readonly object: ManagedObject;
  readonly target: unknown;
}

const referenceStates = new WeakMap<ReferenceCapability, ReferenceState>();
const privateHandles = new WeakMap<
  PrivateReferenceCapability,
  ReferenceCapability
>();

/**
 * Issue an owner-validated capability guarding `target`. Returns a public
 * reference (use-only) and a private handle (control-and-release), both owned
 * by `runtime` and backed by one managed resource so release flows through the
 * managed lifecycle. The consumer supplies the diagnostic identity, matching
 * how existing domains name their managed instances.
 */
export function createReferenceCapability<T>(
  runtime: Runtime,
  target: T,
  identity: ReferenceCapabilityIdentity,
): ReferenceCapabilityPair<T> {
  const controller = createManagedResource(
    runtime,
    createManagedInstanceId(runtime.id, identity.kind, identity.localId),
    createCanonicalClassId(identity.kind, identity.localSlug),
  );
  const resource = controller.object;

  const reference = Object.freeze(
    markRuntimeOwned(runtime, {
      id: resource.id,
      classId: resource.classId,
      get status() {
        return resource.status;
      },
      get tombstone() {
        return resource.tombstone;
      },
      assertActive(operation: string) {
        resource.assertActive(operation);
      },
    }),
  ) as ReferenceCapability<T>;
  referenceStates.set(reference, { object: resource, target });

  const handle = Object.freeze(
    markRuntimeOwned(runtime, {
      reference,
      addCleanup(cleanup: ManagedCleanup) {
        controller.addCleanup(cleanup);
      },
      release: () => resource.release(),
    }),
  ) as PrivateReferenceCapability<T>;
  privateHandles.set(handle, reference);

  return Object.freeze({ reference, handle });
}

/**
 * Validate a public reference for the owning runtime: ownership first (a
 * foreign or unowned handle raises OwnershipError), then framework provenance
 * (a runtime-owned non-capability raises InvalidReferenceCapabilityError), then
 * active status (a released capability raises a lifecycle error).
 */
export function assertReferenceCapability<T>(
  runtime: Runtime,
  reference: ReferenceCapability<T>,
): void {
  runtime.assertOwns(reference);
  if (!referenceStates.has(reference)) {
    throw new InvalidReferenceCapabilityError();
  }
  reference.assertActive("use its reference capability");
}

/**
 * Resolve a public reference to its guarded target, after validating ownership,
 * provenance, and active status.
 */
export function resolveReferenceCapability<T>(
  runtime: Runtime,
  reference: ReferenceCapability<T>,
): T {
  assertReferenceCapability(runtime, reference);
  return getState(reference).target as T;
}

/**
 * Validate a private handle for the owning runtime and return its public
 * reference. Applies the same ownership-then-provenance-then-active checks.
 */
export function assertPrivateReferenceCapability<T>(
  runtime: Runtime,
  handle: PrivateReferenceCapability<T>,
): ReferenceCapability<T> {
  runtime.assertOwns(handle);
  const reference = privateHandles.get(handle);
  if (reference === undefined) {
    throw new InvalidReferenceCapabilityError();
  }
  assertReferenceCapability(runtime, reference);
  return reference as ReferenceCapability<T>;
}

function getState(reference: ReferenceCapability): ReferenceState {
  const state = referenceStates.get(reference);
  if (state === undefined) {
    throw new InvalidReferenceCapabilityError();
  }
  return state;
}
