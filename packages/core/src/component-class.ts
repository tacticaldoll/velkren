import {
  createDefinitionKind,
  isClassDefinition,
  type DefinitionCreate,
  type DefinitionCreationContext,
} from "./definition.js";
import type {
  CanonicalClassId,
  ClassKind,
  LocalClassSlug,
  ManagedInstanceId,
} from "./identity.js";
import type { ManagedStatus, ManagedTombstone } from "./managed-lifecycle.js";
import type { RuntimeOwned } from "./runtime.js";

/**
 * The immutable creation context handed to a ComponentClass `create` behavior.
 * It is the shared managed-instance creation context: the live instance plus a
 * bounded cleanup registrar.
 */
export type ComponentCreationContext = DefinitionCreationContext;

/** The immutable creation behavior of a ComponentClass. */
export type ComponentCreate<Value> = DefinitionCreate<Value>;

/**
 * An immutable, portable component description. A ComponentClass is not owned by
 * any runtime until it is registered with a component domain.
 */
export interface ComponentClass<Value = unknown> {
  readonly kind: ClassKind;
  readonly localSlug: LocalClassSlug;
  readonly id: CanonicalClassId;
  readonly create: ComponentCreate<Value>;
}

/**
 * A runtime-owned managed component instance. It participates in a logical tree
 * and is coordinated through owner-validated references and scopes rather than
 * selectors or global lookup.
 */
export interface ComponentInstance<Value = unknown> extends RuntimeOwned {
  readonly id: ManagedInstanceId;
  readonly classId: CanonicalClassId;
  readonly status: ManagedStatus;
  readonly tombstone: ManagedTombstone | undefined;
  readonly value: Value;
  readonly parent: ComponentInstance | undefined;
  readonly children: readonly ComponentInstance[];
  assertActive(operation: string): void;
  release(): Promise<void>;
}

/**
 * A frozen, owner-validated capability for interacting with a component instance
 * through its public contract. Possession never exposes private runtime
 * capabilities, and a reference to a released target fails as active-only.
 */
export interface Reference<Value = unknown> extends RuntimeOwned {
  readonly targetId: ManagedInstanceId;
  /** Resolve the live target instance, or fail if it is released or revoked. */
  deref(): ComponentInstance<Value>;
}

/**
 * An explicit authority boundary that controls which references are resolvable
 * for a component subtree. Resolution walks the parent chain and never falls
 * back to selectors, the DOM, or a global registry.
 */
export interface Scope extends RuntimeOwned {
  has(name: string): boolean;
  resolve(name: string): Reference;
}

const COMPONENT_KIND = "component";
const componentDefinitions = createDefinitionKind<unknown>(COMPONENT_KIND);

/** Internal: the shared `component` class kind used by the component registry. */
export const componentClassKind: ClassKind = componentDefinitions.kind;

export class ComponentDefinitionError extends TypeError {
  constructor(readonly reason: string) {
    super(`Invalid component definition: ${reason}.`);
    this.name = "ComponentDefinitionError";
  }
}

export class DuplicateComponentRuntimeError extends Error {
  constructor() {
    super("Runtime already has a component domain.");
    this.name = "DuplicateComponentRuntimeError";
  }
}

export class ComponentTreeError extends Error {
  constructor(readonly reason: string) {
    super(`Component tree operation rejected: ${reason}.`);
    this.name = "ComponentTreeError";
  }
}

export class ScopeResolutionError extends Error {
  constructor(readonly name: string) {
    super(`Scope has no entry named ${JSON.stringify(name)}.`);
    this.name = "ScopeResolutionError";
  }
}

export class InvalidReferenceError extends TypeError {
  constructor(readonly reason: string) {
    super(`Invalid component reference: ${reason}.`);
    this.name = "InvalidReferenceError";
  }
}

/**
 * Create an immutable, helper-proven ComponentClass with canonical
 * `component/<slug>` identity and an immutable `create` contract.
 */
export function createComponentClass<Value = unknown>(
  slug: string,
  create: ComponentCreate<Value>,
): ComponentClass<Value> {
  if (typeof create !== "function") {
    throw new ComponentDefinitionError("creation behavior is not a function");
  }
  return componentDefinitions.define(slug, create) as ComponentClass<Value>;
}

/** Narrow an unknown value to a genuine helper-proven ComponentClass. */
export function isComponentClass(value: unknown): value is ComponentClass {
  return isClassDefinition(value) && value.kind === COMPONENT_KIND;
}
