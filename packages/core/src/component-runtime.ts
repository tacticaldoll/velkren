import type { ClassDefinition } from "./definition.js";
import {
  componentClassKind,
  ComponentDefinitionError,
  ComponentTreeError,
  DuplicateComponentRuntimeError,
  InvalidReferenceError,
  isComponentClass,
  ScopeResolutionError,
  type ComponentClass,
  type ComponentInstance,
  type Reference,
  type Scope,
} from "./component-class.js";
import {
  createManagedInstanceId,
  type CanonicalClassId,
  type ManagedInstanceId,
  type QualifiedRegistrationId,
} from "./identity.js";
import {
  createManagedResource,
  type ManagedCleanup,
  type ManagedStatus,
} from "./managed-lifecycle.js";
import {
  ManagedCreationError,
  MissingRegistrationError,
} from "./registration-errors.js";
import { LifecycleError, ManagedReleaseError } from "./runtime-errors.js";
import {
  markRuntimeOwned,
  type Runtime,
  type RuntimeOwned,
} from "./runtime.js";
import { TypedRegistry, type Registration } from "./typed-registry.js";

/** A runtime-owned registration of a ComponentClass in one component domain. */
export interface ComponentClassRegistration extends RuntimeOwned {
  readonly id: QualifiedRegistrationId;
  readonly classId: CanonicalClassId;
  readonly status: ManagedStatus;
  readonly componentClass: ComponentClass;
  assertActive(operation: string): void;
}

/** The component domain composed onto one Runtime. */
export interface ComponentRuntime {
  readonly runtime: Runtime;
  register(componentClass: ComponentClass): ComponentClassRegistration;
  resolve(classId: CanonicalClassId): ComponentClassRegistration | undefined;
  unregister(classId: CanonicalClassId): Promise<void>;
  create<Value = unknown>(
    source: ComponentClassRegistration | CanonicalClassId,
  ): Promise<ComponentInstance<Value>>;
  attach(parent: ComponentInstance, child: ComponentInstance): void;
  createScope(entries?: ScopeEntries): Scope;
  createChildScope(parent: Scope, entries?: ScopeEntries): Scope;
  reference<Value = unknown>(
    instance: ComponentInstance<Value>,
  ): Reference<Value>;
}

export type ScopeEntries =
  Iterable<readonly [string, Reference]> | Readonly<Record<string, Reference>>;

interface ComponentState {
  parent: ComponentInstance | undefined;
  readonly children: ComponentInstance[];
  readonly references: Reference[];
}

interface ScopeState {
  readonly parent: Scope | undefined;
  readonly entries: ReadonlyMap<string, Reference>;
}

const componentRuntimes = new WeakMap<Runtime, ComponentRuntime>();
const componentStates = new WeakMap<ComponentInstance, ComponentState>();
const scopeStates = new WeakMap<Scope, ScopeState>();
const componentReferences = new WeakSet<object>();
const referenceTargets = new WeakMap<Reference, ComponentInstance>();
const runtimeInstanceSequences = new WeakMap<Runtime, number>();

/** Create the single component domain for a Runtime. */
export function createComponentRuntime(runtime: Runtime): ComponentRuntime {
  if (componentRuntimes.has(runtime)) {
    throw new DuplicateComponentRuntimeError();
  }
  const domain = new DefaultComponentRuntime(runtime);
  componentRuntimes.set(runtime, domain);
  return domain;
}

class DefaultComponentRuntime implements ComponentRuntime {
  readonly #registry: TypedRegistry<unknown>;
  readonly #wrappers = new WeakMap<
    Registration<unknown>,
    ComponentClassRegistration
  >();
  readonly #registrations = new WeakMap<
    ComponentClassRegistration,
    Registration<unknown>
  >();
  readonly #classes = new WeakMap<ClassDefinition<unknown>, ComponentClass>();

  constructor(readonly runtime: Runtime) {
    this.#registry = new TypedRegistry<unknown>(runtime, componentClassKind);
  }

  register(componentClass: ComponentClass): ComponentClassRegistration {
    return this.#wrap(this.#registry.register(this.#adapt(componentClass)));
  }

  resolve(classId: CanonicalClassId): ComponentClassRegistration | undefined {
    const registration = this.#registry.resolve(classId);
    return registration === undefined ? undefined : this.#wrap(registration);
  }

  unregister(classId: CanonicalClassId): Promise<void> {
    return this.#registry.unregister(classId);
  }

  async create<Value = unknown>(
    source: ComponentClassRegistration | CanonicalClassId,
  ): Promise<ComponentInstance<Value>> {
    const wrapper = typeof source === "string" ? this.resolve(source) : source;
    if (wrapper === undefined) {
      throw new MissingRegistrationError(source as CanonicalClassId);
    }
    const registration = this.#unwrap(wrapper);
    // Ownership and activity are validated by retain before any allocation.
    this.#registry.retain(registration);

    const controller = createManagedResource<ManagedInstanceId>(
      this.runtime,
      this.#nextInstanceId(),
      registration.classId,
    );
    const instance = controller.object as ComponentInstance<Value>;
    const state: ComponentState = {
      parent: undefined,
      children: [],
      references: [],
    };
    componentStates.set(instance, state);

    // Cleanups are added so that reverse-order release runs:
    // children cascade -> definition cleanups -> reference revocation ->
    // detach/clear -> dependent release.
    controller.addCleanup(() => this.#registry.releaseDependent(registration));
    controller.addCleanup(() => detachAndClear(instance, state));
    controller.addCleanup(() => revokeReferences(state));

    let acceptsCleanups = true;
    try {
      const value = await registration.definition.create({
        instance,
        addCleanup: (cleanup: ManagedCleanup) => {
          if (!acceptsCleanups) {
            throw new Error("Definition creation has already completed.");
          }
          controller.addCleanup(cleanup);
        },
      });
      acceptsCleanups = false;
      instance.assertActive("finish component creation");
      // The child cascade is added last so it releases first.
      controller.addCleanup(() => releaseChildren(state));
      Object.defineProperties(instance, {
        value: {
          enumerable: true,
          get(this: ComponentInstance) {
            this.assertActive("read its created value");
            return value as Value;
          },
        },
        parent: {
          enumerable: true,
          get(this: ComponentInstance) {
            return componentStates.get(this)?.parent;
          },
        },
        children: {
          enumerable: true,
          get(this: ComponentInstance) {
            return Object.freeze([
              ...(componentStates.get(this)?.children ?? []),
            ]);
          },
        },
      });
      return instance;
    } catch (cause) {
      acceptsCleanups = false;
      let cleanupFailures: readonly unknown[] = [];
      try {
        await instance.release();
      } catch (releaseError) {
        cleanupFailures =
          releaseError instanceof ManagedReleaseError
            ? releaseError.failures
            : [releaseError];
      }
      throw new ManagedCreationError(
        registration.classId,
        cause,
        cleanupFailures,
      );
    }
  }

  attach(parent: ComponentInstance, child: ComponentInstance): void {
    this.runtime.assertOwns(parent);
    this.runtime.assertOwns(child);
    parent.assertActive("attach a child");
    child.assertActive("be attached");
    if (parent === child) {
      throw new ComponentTreeError("an instance cannot attach to itself");
    }
    const childState = requireState(child);
    if (childState.parent !== undefined) {
      throw new ComponentTreeError("child is already attached to a parent");
    }
    if (isAncestor(child, parent)) {
      throw new ComponentTreeError("attachment would introduce a cycle");
    }
    const parentState = requireState(parent);
    parentState.children.push(child);
    childState.parent = parent;
  }

  createScope(entries?: ScopeEntries): Scope {
    return this.#createScope(undefined, entries);
  }

  createChildScope(parent: Scope, entries?: ScopeEntries): Scope {
    this.runtime.assertOwns(parent);
    if (!scopeStates.has(parent)) {
      throw new InvalidReferenceError("parent scope lacks provenance");
    }
    return this.#createScope(parent, entries);
  }

  reference<Value = unknown>(
    instance: ComponentInstance<Value>,
  ): Reference<Value> {
    this.runtime.assertOwns(instance);
    instance.assertActive("issue a reference");
    const state = requireState(instance);
    const runtime = this.runtime;
    const reference = Object.freeze(
      markRuntimeOwned(runtime, {
        targetId: instance.id,
        deref(): ComponentInstance<Value> {
          const target = referenceTargets.get(reference);
          if (target === undefined) {
            throw new LifecycleError(
              instance.id,
              "released",
              "dereference a revoked reference",
            );
          }
          target.assertActive("be dereferenced");
          return target as ComponentInstance<Value>;
        },
      }),
    ) as Reference<Value>;
    componentReferences.add(reference);
    referenceTargets.set(reference, instance);
    state.references.push(reference);
    return reference;
  }

  #createScope(parent: Scope | undefined, entries?: ScopeEntries): Scope {
    const map = new Map<string, Reference>();
    if (entries !== undefined) {
      for (const [name, reference] of normalizeEntries(entries)) {
        this.#assertReference(reference);
        map.set(name, reference);
      }
    }
    const scope = Object.freeze(
      markRuntimeOwned(this.runtime, {
        has: (name: string): boolean => resolveScope(scope, name) !== undefined,
        resolve: (name: string): Reference => {
          const reference = resolveScope(scope, name);
          if (reference === undefined) {
            throw new ScopeResolutionError(name);
          }
          return reference;
        },
      }),
    ) as Scope;
    scopeStates.set(scope, {
      parent,
      entries: Object.freeze(map),
    });
    return scope;
  }

  #assertReference(reference: Reference): void {
    if (!componentReferences.has(reference)) {
      throw new InvalidReferenceError("value lacks reference provenance");
    }
    this.runtime.assertOwns(reference);
  }

  #adapt(componentClass: ComponentClass): ClassDefinition<unknown> {
    if (!isComponentClass(componentClass)) {
      throw new ComponentDefinitionError(
        "ComponentClass lacks helper provenance",
      );
    }
    const definition = componentClass;
    this.#classes.set(definition, componentClass);
    return definition;
  }

  #wrap(registration: Registration<unknown>): ComponentClassRegistration {
    const existing = this.#wrappers.get(registration);
    if (existing !== undefined) return existing;
    const classes = this.#classes;
    const wrapper = Object.freeze(
      markRuntimeOwned(this.runtime, {
        id: registration.id,
        classId: registration.classId,
        get status() {
          return registration.status;
        },
        get componentClass() {
          registration.assertActive("read its ComponentClass");
          const componentClass = classes.get(registration.definition);
          if (componentClass === undefined) {
            throw new TypeError("Registration has no ComponentClass.");
          }
          return componentClass;
        },
        assertActive(operation: string) {
          registration.assertActive(operation);
        },
      }),
    ) as ComponentClassRegistration;
    this.#wrappers.set(registration, wrapper);
    this.#registrations.set(wrapper, registration);
    return wrapper;
  }

  #unwrap(wrapper: ComponentClassRegistration): Registration<unknown> {
    this.runtime.assertOwns(wrapper);
    const registration = this.#registrations.get(wrapper);
    if (registration === undefined) {
      throw new TypeError(
        "ComponentClassRegistration does not belong to this component domain.",
      );
    }
    return registration;
  }

  #nextInstanceId(): ManagedInstanceId {
    const next = (runtimeInstanceSequences.get(this.runtime) ?? 0) + 1;
    runtimeInstanceSequences.set(this.runtime, next);
    return createManagedInstanceId(
      this.runtime.id,
      componentClassKind,
      `component-${next}`,
    );
  }
}

function normalizeEntries(
  entries: ScopeEntries,
): Iterable<readonly [string, Reference]> {
  if (Symbol.iterator in Object(entries)) {
    return entries as Iterable<readonly [string, Reference]>;
  }
  return Object.entries(entries as Readonly<Record<string, Reference>>);
}

function resolveScope(scope: Scope, name: string): Reference | undefined {
  let current: Scope | undefined = scope;
  while (current !== undefined) {
    const state = scopeStates.get(current);
    if (state === undefined) return undefined;
    const found = state.entries.get(name);
    if (found !== undefined) return found;
    current = state.parent;
  }
  return undefined;
}

function requireState(instance: ComponentInstance): ComponentState {
  const state = componentStates.get(instance);
  if (state === undefined) {
    throw new TypeError("ComponentInstance was not created by Velkren.");
  }
  return state;
}

function isAncestor(
  candidate: ComponentInstance,
  descendant: ComponentInstance,
): boolean {
  let current: ComponentInstance | undefined = descendant;
  while (current !== undefined) {
    if (current === candidate) return true;
    current = componentStates.get(current)?.parent;
  }
  return false;
}

async function releaseChildren(state: ComponentState): Promise<void> {
  const children = [...state.children].reverse();
  const failures: unknown[] = [];
  for (const child of children) {
    try {
      await child.release();
    } catch (error) {
      if (error instanceof ManagedReleaseError)
        failures.push(...error.failures);
      else failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Component subtree release failed.");
  }
}

function detachAndClear(
  instance: ComponentInstance,
  state: ComponentState,
): void {
  const parent = state.parent;
  if (parent !== undefined) {
    const parentState = componentStates.get(parent);
    if (parentState !== undefined) {
      const index = parentState.children.indexOf(instance);
      if (index >= 0) parentState.children.splice(index, 1);
    }
  }
  state.parent = undefined;
  state.children.length = 0;
}

function revokeReferences(state: ComponentState): void {
  for (const reference of state.references) {
    referenceTargets.delete(reference);
  }
  state.references.length = 0;
}
