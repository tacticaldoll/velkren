import type { CanonicalClassId } from "./identity.js";

export class RegistrationError extends Error {}

export class DuplicateRegistrationError extends RegistrationError {
  constructor(readonly classId: CanonicalClassId) {
    super(`Registration ${JSON.stringify(classId)} is already active.`);
    this.name = "DuplicateRegistrationError";
  }
}

export class RegistrationKindError extends RegistrationError {
  constructor(
    readonly expectedKind: string,
    readonly actualKind: string,
  ) {
    super(
      `Registry kind ${JSON.stringify(expectedKind)} cannot accept definition kind ${JSON.stringify(actualKind)}.`,
    );
    this.name = "RegistrationKindError";
  }
}

export class MissingRegistrationError extends RegistrationError {
  constructor(readonly classId: CanonicalClassId) {
    super(`Registration ${JSON.stringify(classId)} is not active.`);
    this.name = "MissingRegistrationError";
  }
}

export class RegistrationDependencyError extends RegistrationError {
  constructor(
    readonly classId: CanonicalClassId,
    readonly dependents: number,
  ) {
    super(
      `Registration ${JSON.stringify(classId)} has ${dependents} live dependent instance${dependents === 1 ? "" : "s"}.`,
    );
    this.name = "RegistrationDependencyError";
  }
}

export class RegistrationConflictError extends RegistrationError {
  constructor(readonly classId: CanonicalClassId) {
    super(
      `Registration ${JSON.stringify(classId)} changed during an asynchronous registry operation.`,
    );
    this.name = "RegistrationConflictError";
  }
}

export class ManagedCreationError extends Error {
  readonly cleanupFailures: readonly unknown[];

  constructor(
    readonly classId: CanonicalClassId,
    cause: unknown,
    cleanupFailures: readonly unknown[],
  ) {
    super(`Creation from ${JSON.stringify(classId)} failed.`, { cause });
    this.name = "ManagedCreationError";
    this.cleanupFailures = Object.freeze([...cleanupFailures]);
  }
}
