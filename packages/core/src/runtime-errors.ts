import type { CanonicalClassId, RuntimeId } from "./identity.js";

export class OwnershipError extends Error {
  readonly expectedRuntimeId: RuntimeId;
  readonly actualRuntimeId: RuntimeId | undefined;

  constructor(
    expectedRuntimeId: RuntimeId,
    actualRuntimeId: RuntimeId | undefined,
  ) {
    const actual = actualRuntimeId ?? "an unknown owner";
    super(
      `Runtime ${JSON.stringify(expectedRuntimeId)} cannot operate on an object owned by ${JSON.stringify(actual)}.`,
    );
    this.name = "OwnershipError";
    this.expectedRuntimeId = expectedRuntimeId;
    this.actualRuntimeId = actualRuntimeId;
  }
}

export class LifecycleError extends Error {
  readonly instanceId: string;
  readonly status: string;

  constructor(instanceId: string, status: string, operation: string) {
    super(
      `Managed object ${JSON.stringify(instanceId)} is ${status} and cannot ${operation}.`,
    );
    this.name = "LifecycleError";
    this.instanceId = instanceId;
    this.status = status;
  }
}

export class ManagedReleaseError extends Error {
  readonly instanceId: string;
  readonly classId: CanonicalClassId;
  readonly failures: readonly unknown[];

  constructor(
    instanceId: string,
    classId: CanonicalClassId,
    failures: readonly unknown[],
  ) {
    super(
      `Release of managed object ${JSON.stringify(instanceId)} failed in ${failures.length} cleanup operation${failures.length === 1 ? "" : "s"}.`,
      { cause: new AggregateError(failures) },
    );
    this.name = "ManagedReleaseError";
    this.instanceId = instanceId;
    this.classId = classId;
    this.failures = Object.freeze([...failures]);
  }
}
