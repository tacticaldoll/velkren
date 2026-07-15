import type { QualifiedLoaderId } from "./namespace-identity.js";
import type { CanonicalClassId } from "./identity.js";

export class LoaderRegistrationError extends Error {}

export class DuplicateLoaderError extends LoaderRegistrationError {
  constructor(readonly loaderId: QualifiedLoaderId) {
    super(`Loader ${JSON.stringify(loaderId)} is already active.`);
    this.name = "DuplicateLoaderError";
  }
}

export class LoaderKindError extends LoaderRegistrationError {
  constructor(
    readonly expectedKind: string,
    readonly actualKind: string,
  ) {
    super(
      `Loader registry kind ${JSON.stringify(expectedKind)} cannot accept loader kind ${JSON.stringify(actualKind)}.`,
    );
    this.name = "LoaderKindError";
  }
}

export class InvalidLoaderDefinitionError extends LoaderRegistrationError {
  constructor() {
    super("Loader definition lacks immutable helper provenance.");
    this.name = "InvalidLoaderDefinitionError";
  }
}

export class MissingLoaderError extends LoaderRegistrationError {
  constructor(readonly loaderId: QualifiedLoaderId) {
    super(`Loader ${JSON.stringify(loaderId)} is not active.`);
    this.name = "MissingLoaderError";
  }
}

export class LoaderInFlightError extends LoaderRegistrationError {
  constructor(
    readonly loaderId: QualifiedLoaderId,
    readonly inFlight: number,
  ) {
    super(
      `Loader ${JSON.stringify(loaderId)} has ${inFlight} in-flight load${inFlight === 1 ? "" : "s"}.`,
    );
    this.name = "LoaderInFlightError";
  }
}

export class LoaderConflictError extends LoaderRegistrationError {
  constructor(readonly loaderId: QualifiedLoaderId) {
    super(
      `Loader ${JSON.stringify(loaderId)} changed during an asynchronous registry operation.`,
    );
    this.name = "LoaderConflictError";
  }
}

export class NoMatchingLoaderError extends Error {
  constructor(readonly classId: CanonicalClassId) {
    super(`No active namespace loader matches ${JSON.stringify(classId)}.`);
    this.name = "NoMatchingLoaderError";
  }
}

export class LoaderExecutionError extends Error {
  constructor(
    readonly classId: CanonicalClassId,
    readonly loaderId: QualifiedLoaderId,
    cause: unknown,
  ) {
    super(
      `Loader ${JSON.stringify(loaderId)} failed while loading ${JSON.stringify(classId)}.`,
      { cause },
    );
    this.name = "LoaderExecutionError";
  }
}

export class InvalidLoaderContributionError extends Error {
  constructor(
    readonly classId: CanonicalClassId,
    readonly loaderId: QualifiedLoaderId,
    readonly reason: string,
  ) {
    super(
      `Loader ${JSON.stringify(loaderId)} returned an invalid contribution for ${JSON.stringify(classId)}: ${reason}.`,
    );
    this.name = "InvalidLoaderContributionError";
  }
}
