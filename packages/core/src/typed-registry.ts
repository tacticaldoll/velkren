import type { ClassDefinition } from "./definition.js";
import {
  createQualifiedRegistrationId,
  type CanonicalClassId,
  type ClassKind,
  type QualifiedRegistrationId,
} from "./identity.js";
import {
  createManagedResource,
  type ManagedObject,
} from "./managed-lifecycle.js";
import {
  DuplicateRegistrationError,
  MissingRegistrationError,
  RegistrationConflictError,
  RegistrationDependencyError,
  RegistrationKindError,
} from "./registration-errors.js";
import type { Runtime } from "./runtime.js";

export interface Registration<
  Value = unknown,
> extends ManagedObject<QualifiedRegistrationId> {
  readonly definition: ClassDefinition<Value>;
  readonly revision: number;
  readonly previousRevision: number | undefined;
}

interface RegistrationState {
  dependents: number;
  definition: ClassDefinition<unknown> | undefined;
}

const registrationState = new WeakMap<object, RegistrationState>();

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
    const registration = this.#createRegistration(definition, undefined);
    this.#active.set(definition.id, registration);
    return registration;
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
    const replacement = this.#createRegistration(definition, current.revision);
    this.#active.set(definition.id, replacement);
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
    getRegistrationState(registration).dependents += 1;
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
  ): Registration<Value> {
    this.#nextRevision += 1;
    const controller = createManagedResource(
      this.runtime,
      createQualifiedRegistrationId(this.runtime.id, definition.id),
      definition.id,
    );
    const registration = controller.object as Registration<Value>;
    registrationState.set(registration, {
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
      revision: { enumerable: true, value: this.#nextRevision },
    });
    return registration;
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
