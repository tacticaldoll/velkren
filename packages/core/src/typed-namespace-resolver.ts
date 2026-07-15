import { isClassDefinition, type ClassDefinition } from "./definition.js";
import {
  createCanonicalClassId,
  parseCanonicalClassId,
  type CanonicalClassId,
} from "./identity.js";
import {
  InvalidLoaderContributionError,
  LoaderExecutionError,
  LoaderKindError,
  NoMatchingLoaderError,
} from "./loader-errors.js";
import {
  namespaceContains,
  type QualifiedLoaderId,
} from "./namespace-identity.js";
import type {
  LoaderRegistration,
  TypedLoaderRegistry,
} from "./typed-loader-registry.js";
import type { Registration, TypedRegistry } from "./typed-registry.js";

export const MAX_LOADER_CONTRIBUTIONS = 100;

export class TypedNamespaceResolver<Value = unknown> {
  readonly #inFlight = new Map<
    CanonicalClassId,
    Promise<Registration<Value>>
  >();

  constructor(
    readonly registry: TypedRegistry<Value>,
    readonly loaders: TypedLoaderRegistry<Value>,
  ) {
    if (registry.runtime !== loaders.runtime) {
      throw new TypeError(
        "Class and loader registries must share one runtime.",
      );
    }
    if (registry.kind !== loaders.kind) {
      throw new LoaderKindError(registry.kind, loaders.kind);
    }
  }

  load(classId: CanonicalClassId): Promise<Registration<Value>> {
    const parsed = parseCanonicalClassId(classId);
    if (parsed.kind !== this.registry.kind) {
      return Promise.reject(
        new LoaderKindError(this.registry.kind, parsed.kind),
      );
    }

    const active = this.registry.resolve(classId);
    if (active !== undefined) {
      return Promise.resolve(active);
    }
    const current = this.#inFlight.get(classId);
    if (current !== undefined) {
      return current;
    }

    const operation = this.#performLoad(classId, parsed.localSlug);
    this.#inFlight.set(classId, operation);
    const clear = () => {
      if (this.#inFlight.get(classId) === operation) {
        this.#inFlight.delete(classId);
      }
    };
    void operation.then(clear, clear);
    return operation;
  }

  async #performLoad(
    classId: CanonicalClassId,
    localSlug: ReturnType<typeof parseCanonicalClassId>["localSlug"],
  ): Promise<Registration<Value>> {
    const lease = this.loaders.select(localSlug);
    if (lease === undefined) {
      throw new NoMatchingLoaderError(classId);
    }
    const { registration } = lease;
    this.loaders.runtime.assertOwns(registration);

    try {
      let contribution: Iterable<ClassDefinition<Value>>;
      try {
        contribution = await registration.definition.load(classId);
      } catch (cause) {
        throw new LoaderExecutionError(classId, registration.id, cause);
      }

      const staged = this.#materialize(classId, registration.id, contribution);
      this.#validateContribution(classId, registration, staged);
      await this.registry.registerBatch(staged);
      const loaded = this.registry.resolve(classId);
      if (loaded === undefined) {
        throw new TypeError(
          "Committed loader contribution omitted its target.",
        );
      }
      return loaded;
    } finally {
      lease.release();
    }
  }

  #materialize(
    classId: CanonicalClassId,
    loaderId: QualifiedLoaderId,
    contribution: Iterable<ClassDefinition<Value>>,
  ): ClassDefinition<Value>[] {
    const staged: ClassDefinition<Value>[] = [];
    try {
      for (const definition of contribution) {
        if (staged.length === MAX_LOADER_CONTRIBUTIONS) {
          throw new InvalidLoaderContributionError(
            classId,
            loaderId,
            `more than ${MAX_LOADER_CONTRIBUTIONS} definitions`,
          );
        }
        staged.push(definition);
      }
    } catch (cause) {
      if (cause instanceof InvalidLoaderContributionError) {
        throw cause;
      }
      throw new LoaderExecutionError(classId, loaderId, cause);
    }
    return staged;
  }

  #validateContribution(
    classId: CanonicalClassId,
    registration: LoaderRegistration<Value>,
    staged: readonly ClassDefinition<Value>[],
  ): void {
    const ids = new Set<CanonicalClassId>();
    for (const definition of staged) {
      if (!isClassDefinition(definition)) {
        this.#invalid(
          classId,
          registration.id,
          "definition lacks immutable helper provenance",
        );
      }
      if (definition.kind !== this.registry.kind) {
        this.#invalid(classId, registration.id, "definition kind differs");
      }
      if (
        createCanonicalClassId(definition.kind, definition.localSlug) !==
        definition.id
      ) {
        this.#invalid(classId, registration.id, "definition identity differs");
      }
      if (!namespaceContains(registration.namespace, definition.localSlug)) {
        this.#invalid(
          classId,
          registration.id,
          "definition is outside namespace",
        );
      }
      if (ids.has(definition.id)) {
        this.#invalid(classId, registration.id, "definition ID is duplicated");
      }
      ids.add(definition.id);
    }
    if (!ids.has(classId)) {
      this.#invalid(classId, registration.id, "requested class is missing");
    }
  }

  #invalid(
    classId: CanonicalClassId,
    loaderId: QualifiedLoaderId,
    reason: string,
  ): never {
    throw new InvalidLoaderContributionError(classId, loaderId, reason);
  }
}
