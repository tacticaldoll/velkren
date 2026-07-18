import type { ComponentInstance } from "./component-class.js";
import { isComponentReference } from "./component-runtime.js";
import type { CanonicalClassId, QualifiedRegistrationId } from "./identity.js";
import type { ManagedStatus } from "./managed-lifecycle.js";
import {
  markRuntimeOwned,
  type Runtime,
  type RuntimeOwned,
} from "./runtime.js";
import { createJsonSnapshot, type JsonObject } from "./strict-json.js";
import { TypedRegistry, type Registration } from "./typed-registry.js";
import {
  adaptTemplateClass,
  DuplicateTemplateBindingError,
  DuplicateTemplateRuntimeError,
  isTemplateClass,
  RenderPlanError,
  templateClassKind,
  templateClassOf,
  TemplateDefinitionError,
  TemplateResolutionError,
  type RenderNode,
  type RenderPlan,
  type ResolvedSlot,
  type TemplateClass,
  type TemplateExplanation,
  type TemplateNode,
  type TemplateSlotFill,
} from "./template-class.js";

/** A runtime-owned registration of a TemplateClass in one template domain. */
export interface TemplateClassRegistration extends RuntimeOwned {
  readonly id: QualifiedRegistrationId;
  readonly classId: CanonicalClassId;
  readonly status: ManagedStatus;
  readonly templateClass: TemplateClass;
  assertActive(operation: string): void;
}

export type TemplateSlotFills =
  | Iterable<readonly [string, TemplateSlotFill]>
  | Readonly<Record<string, TemplateSlotFill>>;

/** The template domain composed onto one Runtime. */
export interface TemplateRuntime {
  readonly runtime: Runtime;
  register(templateClass: TemplateClass): TemplateClassRegistration;
  replace(templateClass: TemplateClass): Promise<TemplateClassRegistration>;
  resolvePlan(
    instance: ComponentInstance,
    fills?: TemplateSlotFills,
  ): RenderPlan;
  explainPlan(instance: ComponentInstance): TemplateExplanation;
}

const templateRuntimes = new WeakMap<Runtime, TemplateRuntime>();

/** Create the single template domain for a Runtime. */
export function createTemplateRuntime(runtime: Runtime): TemplateRuntime {
  if (templateRuntimes.has(runtime)) {
    throw new DuplicateTemplateRuntimeError();
  }
  const domain = new DefaultTemplateRuntime(runtime);
  templateRuntimes.set(runtime, domain);
  return domain;
}

class DefaultTemplateRuntime implements TemplateRuntime {
  readonly #registry: TypedRegistry<TemplateClass>;
  readonly #bindings = new Map<CanonicalClassId, Registration<TemplateClass>>();
  readonly #wrappers = new WeakMap<
    Registration<TemplateClass>,
    TemplateClassRegistration
  >();

  constructor(readonly runtime: Runtime) {
    this.#registry = new TypedRegistry<TemplateClass>(
      runtime,
      templateClassKind,
    );
  }

  register(templateClass: TemplateClass): TemplateClassRegistration {
    this.#assertTemplate(templateClass);
    if (this.#bindings.has(templateClass.component)) {
      throw new DuplicateTemplateBindingError(templateClass.component);
    }
    const registration = this.#registry.register(
      adaptTemplateClass(templateClass),
    );
    this.#bindings.set(templateClass.component, registration);
    return this.#wrap(registration);
  }

  async replace(
    templateClass: TemplateClass,
  ): Promise<TemplateClassRegistration> {
    this.#assertTemplate(templateClass);
    const registration = await this.#registry.replace(
      adaptTemplateClass(templateClass),
    );
    this.#bindings.set(templateClass.component, registration);
    return this.#wrap(registration);
  }

  resolvePlan(
    instance: ComponentInstance,
    fills?: TemplateSlotFills,
  ): RenderPlan {
    this.runtime.assertOwns(instance);
    instance.assertActive("resolve a render plan");
    const registration = this.#bindings.get(instance.classId);
    if (registration === undefined) {
      throw new TemplateResolutionError(
        `no template is bound to ${JSON.stringify(instance.classId)}`,
      );
    }
    const templateClass = this.#templateOf(registration);
    const fillMap = normalizeFills(fills);
    const consumed = new Set<string>();
    const roots: Record<string, RenderNode> = {};
    for (const [name, node] of Object.entries(templateClass.roots)) {
      roots[name] = this.#buildNode(node, fillMap, consumed);
    }
    for (const name of fillMap.keys()) {
      if (!consumed.has(name)) {
        throw new RenderPlanError(
          `fill for unknown slot ${JSON.stringify(name)}`,
        );
      }
    }
    return Object.freeze({
      templateId: templateClass.id,
      instanceId: instance.id,
      roots: Object.freeze(roots),
    });
  }

  explainPlan(instance: ComponentInstance): TemplateExplanation {
    this.runtime.assertOwns(instance);
    const registration = this.#bindings.get(instance.classId);
    if (registration === undefined) {
      return Object.freeze({
        instanceId: instance.id,
        componentClassId: instance.classId,
        bound: false,
        templateId: null,
        roots: Object.freeze([]),
        slots: Object.freeze([]),
      });
    }
    const templateClass = this.#templateOf(registration);
    return Object.freeze({
      instanceId: instance.id,
      componentClassId: instance.classId,
      bound: true,
      templateId: templateClass.id,
      roots: Object.freeze(Object.keys(templateClass.roots)),
      slots: Object.freeze([...templateClass.slotNames]),
    });
  }

  #buildNode(
    node: TemplateNode,
    fills: ReadonlyMap<string, TemplateSlotFill>,
    consumed: Set<string>,
  ): RenderNode {
    let attributes: JsonObject;
    try {
      attributes = createJsonSnapshot<JsonObject>(node.attributes ?? {}).value;
    } catch (cause) {
      throw new RenderPlanError(
        `node ${JSON.stringify(node.kind)} has non-JSON attributes: ${String(cause)}`,
      );
    }
    const slots: Record<string, ResolvedSlot> = {};
    for (const declaration of node.slots ?? []) {
      const fill = fills.get(declaration.name);
      if (fill === undefined) {
        if (declaration.required !== false) {
          throw new RenderPlanError(
            `required slot ${JSON.stringify(declaration.name)} was not filled`,
          );
        }
        continue;
      }
      consumed.add(declaration.name);
      slots[declaration.name] = this.#resolveSlot(declaration.name, fill);
    }
    const children = (node.children ?? []).map((child) =>
      this.#buildNode(child, fills, consumed),
    );
    return Object.freeze({
      kind: node.kind,
      attributes,
      children: Object.freeze(children),
      slots: Object.freeze(slots),
    });
  }

  #resolveSlot(name: string, fill: TemplateSlotFill): ResolvedSlot {
    if (isComponentReference(fill)) {
      this.runtime.assertOwns(fill);
      return Object.freeze({ kind: "reference", reference: fill });
    }
    if (
      typeof fill === "object" &&
      fill !== null &&
      Object.prototype.hasOwnProperty.call(fill, "content")
    ) {
      const content = fill.content;
      try {
        return Object.freeze({
          kind: "content",
          content: createJsonSnapshot(content).value,
        });
      } catch (cause) {
        throw new RenderPlanError(
          `slot ${JSON.stringify(name)} content is not strict JSON: ${String(cause)}`,
        );
      }
    }
    throw new RenderPlanError(
      `slot ${JSON.stringify(name)} fill is neither a reference nor content`,
    );
  }

  #assertTemplate(templateClass: TemplateClass): void {
    if (!isTemplateClass(templateClass)) {
      throw new TemplateDefinitionError(
        "TemplateClass lacks helper provenance",
      );
    }
  }

  #templateOf(registration: Registration<TemplateClass>): TemplateClass {
    registration.assertActive("read its TemplateClass");
    const templateClass = templateClassOf(registration.definition);
    if (templateClass === undefined) {
      throw new TypeError("Registration has no TemplateClass.");
    }
    return templateClass;
  }

  #wrap(registration: Registration<TemplateClass>): TemplateClassRegistration {
    const existing = this.#wrappers.get(registration);
    if (existing !== undefined) return existing;
    const templateOf = (): TemplateClass => this.#templateOf(registration);
    const wrapper = Object.freeze(
      markRuntimeOwned(this.runtime, {
        id: registration.id,
        classId: registration.classId,
        get status() {
          return registration.status;
        },
        get templateClass() {
          return templateOf();
        },
        assertActive(operation: string) {
          registration.assertActive(operation);
        },
      }),
    ) as TemplateClassRegistration;
    this.#wrappers.set(registration, wrapper);
    return wrapper;
  }
}

function normalizeFills(
  fills: TemplateSlotFills | undefined,
): ReadonlyMap<string, TemplateSlotFill> {
  const map = new Map<string, TemplateSlotFill>();
  if (fills === undefined) return map;
  const entries: Iterable<readonly [string, TemplateSlotFill]> =
    Symbol.iterator in Object(fills)
      ? (fills as Iterable<readonly [string, TemplateSlotFill]>)
      : Object.entries(fills as Readonly<Record<string, TemplateSlotFill>>);
  for (const [name, fill] of entries) {
    if (map.has(name)) {
      throw new RenderPlanError(
        `duplicate fill for slot ${JSON.stringify(name)}`,
      );
    }
    map.set(name, fill);
  }
  return map;
}
