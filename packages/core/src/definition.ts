import {
  createCanonicalClassId,
  createClassKind,
  createLocalClassSlug,
  type CanonicalClassId,
  type ClassKind,
  type LocalClassSlug,
} from "./identity.js";
import type { ManagedCleanup, ManagedObject } from "./managed-lifecycle.js";

export interface DefinitionCreationContext {
  readonly instance: ManagedObject;
  readonly addCleanup: (cleanup: ManagedCleanup) => void;
}

export type DefinitionCreate<Value> = (
  context: DefinitionCreationContext,
) => Value | Promise<Value>;

export interface ClassDefinition<Value = unknown> {
  readonly kind: ClassKind;
  readonly localSlug: LocalClassSlug;
  readonly id: CanonicalClassId;
  readonly create: DefinitionCreate<Value>;
}

export interface DefinitionKind<Value = unknown> {
  readonly kind: ClassKind;
  define(slug: string, create: DefinitionCreate<Value>): ClassDefinition<Value>;
}

const classDefinitions = new WeakSet<object>();

export function createDefinitionKind<Value = unknown>(
  kind: string,
): DefinitionKind<Value> {
  const validKind = createClassKind(kind);
  return Object.freeze({
    kind: validKind,
    define(slug: string, create: DefinitionCreate<Value>) {
      const localSlug = createLocalClassSlug(slug);
      const definition = {
        kind: validKind,
        localSlug,
        id: createCanonicalClassId(validKind, localSlug),
        create,
      };
      classDefinitions.add(definition);
      return Object.freeze(definition);
    },
  });
}

export function isClassDefinition(value: unknown): value is ClassDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    classDefinitions.has(value) &&
    Object.isFrozen(value)
  );
}
