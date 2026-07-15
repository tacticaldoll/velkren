import type { ClassDefinition } from "./definition.js";
import {
  createCanonicalClassId,
  createClassKind,
  type CanonicalClassId,
  type ClassKind,
  type LocalClassSlug,
} from "./identity.js";
import {
  DuplicateLoaderError,
  InvalidLoaderDefinitionError,
  LoaderConflictError,
  LoaderInFlightError,
  LoaderKindError,
  MissingLoaderError,
} from "./loader-errors.js";
import {
  createManagedResource,
  type ManagedObject,
} from "./managed-lifecycle.js";
import {
  createLoaderNamespace,
  createQualifiedLoaderId,
  selectDeepestNamespace,
  type LoaderNamespace,
  type QualifiedLoaderId,
} from "./namespace-identity.js";
import type { Runtime } from "./runtime.js";

export type LoaderBehavior<Value> = (
  requestedClassId: CanonicalClassId,
) =>
  Iterable<ClassDefinition<Value>> | Promise<Iterable<ClassDefinition<Value>>>;

export interface LoaderDefinition<Value = unknown> {
  readonly kind: ClassKind;
  readonly namespace: LoaderNamespace;
  readonly load: LoaderBehavior<Value>;
}

export interface LoaderKind<Value = unknown> {
  readonly kind: ClassKind;
  define(
    namespace: string | undefined,
    load: LoaderBehavior<Value>,
  ): LoaderDefinition<Value>;
}

export interface LoaderRegistration<
  Value = unknown,
> extends ManagedObject<QualifiedLoaderId> {
  readonly namespace: LoaderNamespace;
  readonly definition: LoaderDefinition<Value>;
  readonly revision: number;
  readonly previousRevision: number | undefined;
}

export interface LoaderLease<Value> {
  readonly registration: LoaderRegistration<Value>;
  release(): void;
}

interface LoaderState {
  definition: LoaderDefinition<unknown> | undefined;
  inFlight: number;
}

const loaderState = new WeakMap<object, LoaderState>();
const loaderDefinitions = new WeakSet<object>();

export function createLoaderKind<Value = unknown>(
  kind: string,
): LoaderKind<Value> {
  const validKind = createClassKind(kind);
  return Object.freeze({
    kind: validKind,
    define(namespace: string | undefined, load: LoaderBehavior<Value>) {
      const definition = {
        kind: validKind,
        namespace: createLoaderNamespace(namespace),
        load,
      };
      loaderDefinitions.add(definition);
      return Object.freeze(definition);
    },
  });
}

export class TypedLoaderRegistry<Value = unknown> {
  readonly #active = new Map<LoaderNamespace, LoaderRegistration<Value>>();
  #nextRevision = 0;

  constructor(
    readonly runtime: Runtime,
    readonly kind: ClassKind,
  ) {}

  register(definition: LoaderDefinition<Value>): LoaderRegistration<Value> {
    this.#assertKind(definition);
    if (this.#active.has(definition.namespace)) {
      throw new DuplicateLoaderError(this.#qualifiedId(definition.namespace));
    }
    const revision = this.#nextRevision + 1;
    const registration = this.#createRegistration(
      definition,
      undefined,
      revision,
    );
    this.#active.set(definition.namespace, registration);
    this.#nextRevision = revision;
    return registration;
  }

  select(localSlug: LocalClassSlug): LoaderLease<Value> | undefined {
    const registration = selectDeepestNamespace(
      this.#active.values(),
      localSlug,
    );
    if (registration === undefined) {
      return undefined;
    }
    registration.assertActive("serve a class load");
    const state = getLoaderState(registration);
    state.inFlight += 1;
    let released = false;
    return {
      registration,
      release() {
        if (released) {
          return;
        }
        released = true;
        state.inFlight -= 1;
      },
    };
  }

  async replace(
    definition: LoaderDefinition<Value>,
  ): Promise<LoaderRegistration<Value>> {
    this.#assertKind(definition);
    const current = this.#require(definition.namespace);
    this.#assertIdle(current);
    await current.release();
    if (this.#active.get(definition.namespace) !== current) {
      throw new LoaderConflictError(current.id);
    }
    const revision = this.#nextRevision + 1;
    const replacement = this.#createRegistration(
      definition,
      current.revision,
      revision,
    );
    this.#active.set(definition.namespace, replacement);
    this.#nextRevision = revision;
    return replacement;
  }

  async unregister(namespace: LoaderNamespace): Promise<void> {
    const current = this.#require(namespace);
    this.#assertIdle(current);
    await current.release();
    if (this.#active.get(namespace) !== current) {
      throw new LoaderConflictError(current.id);
    }
    this.#active.delete(namespace);
  }

  #createRegistration(
    definition: LoaderDefinition<Value>,
    previousRevision: number | undefined,
    revision: number,
  ): LoaderRegistration<Value> {
    const diagnosticSlug =
      definition.namespace === "@root"
        ? "loader.root"
        : `loader.${definition.namespace}`;
    const controller = createManagedResource(
      this.runtime,
      this.#qualifiedId(definition.namespace),
      createCanonicalClassId(definition.kind, diagnosticSlug),
    );
    const registration = controller.object as LoaderRegistration<Value>;
    loaderState.set(registration, { definition, inFlight: 0 });
    controller.addCleanup(() => {
      getLoaderState(registration).definition = undefined;
    });
    Object.defineProperties(registration, {
      definition: {
        enumerable: true,
        get(this: LoaderRegistration<Value>) {
          this.assertActive("read its loader definition");
          const definition = getLoaderState(this).definition;
          if (definition === undefined) {
            throw new TypeError(
              "Active loader registration has no definition.",
            );
          }
          return definition as LoaderDefinition<Value>;
        },
      },
      namespace: { enumerable: true, value: definition.namespace },
      previousRevision: { enumerable: true, value: previousRevision },
      revision: { enumerable: true, value: revision },
    });
    return registration;
  }

  #require(namespace: LoaderNamespace): LoaderRegistration<Value> {
    const registration = this.#active.get(namespace);
    if (registration === undefined) {
      throw new MissingLoaderError(this.#qualifiedId(namespace));
    }
    return registration;
  }

  #assertKind(definition: LoaderDefinition<Value>): void {
    if (!loaderDefinitions.has(definition) || !Object.isFrozen(definition)) {
      throw new InvalidLoaderDefinitionError();
    }
    if (definition.kind !== this.kind) {
      throw new LoaderKindError(this.kind, definition.kind);
    }
  }

  #assertIdle(registration: LoaderRegistration<Value>): void {
    const { inFlight } = getLoaderState(registration);
    if (inFlight > 0) {
      throw new LoaderInFlightError(registration.id, inFlight);
    }
  }

  #qualifiedId(namespace: LoaderNamespace): QualifiedLoaderId {
    return createQualifiedLoaderId(this.runtime.id, this.kind, namespace);
  }
}

function getLoaderState(registration: object): LoaderState {
  const state = loaderState.get(registration);
  if (state === undefined) {
    throw new TypeError("Loader registration was not created by Velkren.");
  }
  return state;
}
