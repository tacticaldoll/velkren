import type { ClassDefinition } from "./definition.js";
import {
  createQualifiedRegistrationId,
  type CanonicalClassId,
  type ClassKind,
  type QualifiedRegistrationId,
} from "./identity.js";
import {
  createManagedResource,
  type ManagedCleanup,
  type ManagedObjectController,
  type ManagedObject,
} from "./managed-lifecycle.js";
import {
  DuplicateRegistrationError,
  MissingRegistrationError,
  RegistrationBatchError,
  RegistrationBatchConflictError,
  RegistrationAdmissionError,
  RegistrationConflictError,
  RegistrationDependencyError,
  RegistrationKindError,
  RegistrationWithdrawalError,
} from "./registration-errors.js";
import { ManagedReleaseError } from "./runtime-errors.js";
import type { Runtime } from "./runtime.js";

export interface Registration<
  Value = unknown,
> extends ManagedObject<QualifiedRegistrationId> {
  readonly definition: ClassDefinition<Value>;
  readonly revision: number;
  readonly previousRevision: number | undefined;
}

interface RegistrationState {
  admissionLeases: number;
  dependents: number;
  definition: ClassDefinition<unknown> | undefined;
}

const registrationState = new WeakMap<object, RegistrationState>();

export type RegistrationInitializer<Value> = (context: {
  readonly definition: ClassDefinition<Value>;
  readonly registration: Registration<Value>;
  readonly addCleanup: (cleanup: ManagedCleanup) => void;
}) => void;

export class TypedRegistry<Value = unknown> {
  readonly #active = new Map<CanonicalClassId, Registration<Value>>();
  #nextRevision = 0;

  constructor(
    readonly runtime: Runtime,
    readonly kind: ClassKind,
  ) {}

  resolve(classId: CanonicalClassId): Registration<Value> | undefined {
    return this.#active.get(classId);
  }

  register(definition: ClassDefinition<Value>): Registration<Value> {
    this.#assertKind(definition);
    if (this.#active.has(definition.id)) {
      throw new DuplicateRegistrationError(definition.id);
    }
    const revision = this.#nextRevision + 1;
    const { registration } = this.#createRegistration(
      definition,
      undefined,
      revision,
    );
    this.#active.set(definition.id, registration);
    this.#nextRevision = revision;
    return registration;
  }

  async registerBatch(
    definitions: Iterable<ClassDefinition<Value>>,
    initialize?: RegistrationInitializer<Value>,
  ): Promise<readonly Registration<Value>[]> {
    const staged = [...definitions];
    const startingRevision = this.#nextRevision;
    const stagedIds = new Set<CanonicalClassId>();
    for (const definition of staged) {
      this.#assertKind(definition);
      if (stagedIds.has(definition.id) || this.#active.has(definition.id)) {
        throw new DuplicateRegistrationError(definition.id);
      }
      stagedIds.add(definition.id);
    }

    const created: Array<{
      controller: ManagedObjectController<QualifiedRegistrationId>;
      registration: Registration<Value>;
    }> = [];
    try {
      for (const [index, definition] of staged.entries()) {
        const initialized = this.#createRegistration(
          definition,
          undefined,
          startingRevision + index + 1,
        );
        created.push(initialized);
        initialize?.({
          definition,
          registration: initialized.registration,
          addCleanup: initialized.controller.addCleanup,
        });
      }
      for (const { registration } of created) {
        if (this.#active.has(registration.classId)) {
          throw new DuplicateRegistrationError(registration.classId);
        }
      }
      if (this.#nextRevision !== startingRevision) {
        throw new RegistrationBatchConflictError();
      }
    } catch (cause) {
      const cleanupFailures: unknown[] = [];
      for (const { registration } of created.reverse()) {
        try {
          await registration.release();
        } catch (error) {
          if (error instanceof ManagedReleaseError) {
            cleanupFailures.push(...error.failures);
          } else {
            cleanupFailures.push(error);
          }
        }
      }
      throw new RegistrationBatchError(cause, cleanupFailures);
    }

    for (const { registration } of created) {
      this.#active.set(registration.classId, registration);
    }
    this.#nextRevision = startingRevision + created.length;
    return Object.freeze(created.map(({ registration }) => registration));
  }

  async replace(
    definition: ClassDefinition<Value>,
  ): Promise<Registration<Value>> {
    this.#assertKind(definition);
    const current = this.#require(definition.id);
    this.#assertNoDependents(current);
    await current.release();
    if (this.#active.get(definition.id) !== current) {
      throw new RegistrationConflictError(definition.id);
    }
    const revision = this.#nextRevision + 1;
    const { registration: replacement } = this.#createRegistration(
      definition,
      current.revision,
      revision,
    );
    this.#active.set(definition.id, replacement);
    this.#nextRevision = revision;
    return replacement;
  }

  async unregister(classId: CanonicalClassId): Promise<void> {
    const current = this.#require(classId);
    this.#assertNoDependents(current);
    await current.release();
    if (this.#active.get(classId) !== current) {
      throw new RegistrationConflictError(classId);
    }
    this.#active.delete(classId);
  }

  retain(registration: Registration<Value>): void {
    this.runtime.assertOwns(registration);
    if (this.#active.get(registration.classId) !== registration) {
      throw new MissingRegistrationError(registration.classId);
    }
    registration.assertActive("create a dependent instance");
    const state = getRegistrationState(registration);
    if (state.admissionLeases > 0) {
      throw new RegistrationAdmissionError(registration.classId);
    }
    state.dependents += 1;
  }

  dependentCount(registration: Registration<Value>): number {
    this.runtime.assertOwns(registration);
    return getRegistrationState(registration).dependents;
  }

  acquireAdmissionLease(
    registrations: Iterable<Registration<Value>>,
  ): () => void {
    const exact = [...registrations];
    for (const registration of exact) {
      this.runtime.assertOwns(registration);
      if (this.#active.get(registration.classId) !== registration) {
        throw new MissingRegistrationError(registration.classId);
      }
      registration.assertActive("lease dependent admission");
    }
    for (const registration of exact) {
      getRegistrationState(registration).admissionLeases += 1;
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      for (const registration of exact) {
        const state = getRegistrationState(registration);
        state.admissionLeases -= 1;
      }
    };
  }

  withdrawExact(registrations: Iterable<Registration<Value>>): Promise<void> {
    const exact = [...registrations];
    for (const registration of exact) {
      this.runtime.assertOwns(registration);
      if (this.#active.get(registration.classId) !== registration) {
        throw new MissingRegistrationError(registration.classId);
      }
      this.#assertNoDependents(registration);
    }
    for (const registration of exact) {
      this.#active.delete(registration.classId);
    }
    return finalizeWithdrawal(exact);
  }

  releaseDependent(registration: Registration<Value>): void {
    this.runtime.assertOwns(registration);
    const state = getRegistrationState(registration);
    if (state.dependents === 0) {
      throw new Error("Registration dependent count cannot become negative.");
    }
    state.dependents -= 1;
  }

  #createRegistration(
    definition: ClassDefinition<Value>,
    previousRevision: number | undefined,
    revision: number,
  ): {
    controller: ManagedObjectController<QualifiedRegistrationId>;
    registration: Registration<Value>;
  } {
    const controller = createManagedResource(
      this.runtime,
      createQualifiedRegistrationId(this.runtime.id, definition.id),
      definition.id,
    );
    const registration = controller.object as Registration<Value>;
    registrationState.set(registration, {
      admissionLeases: 0,
      definition,
      dependents: 0,
    });
    controller.addCleanup(() => {
      getRegistrationState(registration).definition = undefined;
    });
    Object.defineProperties(registration, {
      definition: {
        enumerable: true,
        get(this: Registration<Value>) {
          this.assertActive("read its definition");
          const activeDefinition = getRegistrationState(this).definition;
          if (activeDefinition === undefined) {
            throw new TypeError("Active registration has no definition.");
          }
          return activeDefinition as ClassDefinition<Value>;
        },
      },
      previousRevision: { enumerable: true, value: previousRevision },
      revision: { enumerable: true, value: revision },
    });
    return { controller, registration };
  }

  #assertKind(definition: ClassDefinition<Value>): void {
    if (definition.kind !== this.kind) {
      throw new RegistrationKindError(this.kind, definition.kind);
    }
  }

  #require(classId: CanonicalClassId): Registration<Value> {
    const registration = this.#active.get(classId);
    if (registration === undefined) {
      throw new MissingRegistrationError(classId);
    }
    return registration;
  }

  #assertNoDependents(registration: Registration<Value>): void {
    const { dependents } = getRegistrationState(registration);
    if (dependents > 0) {
      throw new RegistrationDependencyError(registration.classId, dependents);
    }
  }
}

function getRegistrationState(registration: Registration): RegistrationState {
  const state = registrationState.get(registration);
  if (state === undefined) {
    throw new TypeError("Registration was not created by Velkren.");
  }
  return state;
}

async function finalizeWithdrawal(
  registrations: readonly Registration[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const registration of [...registrations].reverse()) {
    try {
      await registration.release();
    } catch (error) {
      if (error instanceof ManagedReleaseError)
        failures.push(...error.failures);
      else failures.push(error);
    }
  }
  if (failures.length > 0) throw new RegistrationWithdrawalError(failures);
}
