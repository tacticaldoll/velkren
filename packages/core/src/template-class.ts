import { createDefinitionKind, type ClassDefinition } from "./definition.js";
import {
  createCanonicalClassId,
  createLocalClassSlug,
  parseCanonicalClassId,
  type CanonicalClassId,
  type ClassKind,
  type LocalClassSlug,
} from "./identity.js";
import type { Reference } from "./component-class.js";
import type { JsonObject, JsonValue } from "./strict-json.js";

/** A declared named slot on a template node. */
export interface TemplateSlotDeclaration {
  readonly name: string;
  readonly required?: boolean;
}

/** An authored, renderer-neutral template node. */
export interface TemplateNode {
  readonly kind: string;
  readonly attributes?: JsonObject;
  readonly children?: readonly TemplateNode[];
  readonly slots?: readonly TemplateSlotDeclaration[];
}

/** The authored body of a TemplateClass: a bound class and named roots. */
export interface TemplateDefinition {
  readonly component: string;
  readonly roots: Readonly<Record<string, TemplateNode>>;
}

/**
 * An immutable, portable template description bound to exactly one
 * ComponentClass. Not owned by any runtime until registered.
 */
export interface TemplateClass {
  readonly kind: ClassKind;
  readonly localSlug: LocalClassSlug;
  readonly id: CanonicalClassId;
  readonly component: CanonicalClassId;
  readonly roots: Readonly<Record<string, TemplateNode>>;
  readonly slotNames: readonly string[];
}

/** A slot fill supplied at resolution: a child reference or static content. */
export type TemplateSlotFill = Reference | TemplateContent;

/** Renderer-neutral static content for a slot. */
export interface TemplateContent {
  readonly content: JsonValue;
}

/** A resolved slot in a render plan: a reference or static content. */
export type ResolvedSlot =
  | { readonly kind: "reference"; readonly reference: Reference }
  | { readonly kind: "content"; readonly content: JsonValue };

/** A normalized, renderer-neutral node in a render plan. */
export interface RenderNode {
  readonly kind: string;
  readonly attributes: JsonObject;
  readonly children: readonly RenderNode[];
  readonly slots: Readonly<Record<string, ResolvedSlot>>;
}

/** A deeply frozen, renderer-neutral render plan for a component instance. */
export interface RenderPlan {
  readonly templateId: CanonicalClassId;
  readonly instanceId: string;
  readonly roots: Readonly<Record<string, RenderNode>>;
}

/** Immutable strict-JSON explanation of template selection for an instance. */
export interface TemplateExplanation {
  readonly instanceId: string;
  readonly componentClassId: CanonicalClassId;
  readonly bound: boolean;
  readonly templateId: CanonicalClassId | null;
  readonly roots: readonly string[];
  readonly slots: readonly string[];
}

const TEMPLATE_KIND = "template";
const templateDefinitions = createDefinitionKind<TemplateClass>(TEMPLATE_KIND);

/** Internal: the shared `template` class kind used by the template registry. */
export const templateClassKind: ClassKind = templateDefinitions.kind;

export class TemplateDefinitionError extends TypeError {
  constructor(readonly reason: string) {
    super(`Invalid template definition: ${reason}.`);
    this.name = "TemplateDefinitionError";
  }
}

export class DuplicateTemplateRuntimeError extends Error {
  constructor() {
    super("Runtime already has a template domain.");
    this.name = "DuplicateTemplateRuntimeError";
  }
}

export class DuplicateTemplateBindingError extends Error {
  constructor(readonly component: CanonicalClassId) {
    super(
      `ComponentClass ${JSON.stringify(component)} already has an active template.`,
    );
    this.name = "DuplicateTemplateBindingError";
  }
}

export class TemplateResolutionError extends Error {
  constructor(readonly reason: string) {
    super(`Template resolution failed: ${reason}.`);
    this.name = "TemplateResolutionError";
  }
}

export class RenderPlanError extends Error {
  constructor(readonly reason: string) {
    super(`Render plan construction failed: ${reason}.`);
    this.name = "RenderPlanError";
  }
}

const templateClasses = new WeakMap<
  ClassDefinition<TemplateClass>,
  TemplateClass
>();
const templateProvenance = new WeakSet<object>();

/**
 * Create an immutable, helper-proven TemplateClass bound to one ComponentClass,
 * with canonical `template/<slug>` identity and named roots and slots.
 */
export function createTemplateClass(
  slug: string,
  definition: TemplateDefinition,
): TemplateClass {
  if (typeof definition !== "object" || definition === null) {
    throw new TemplateDefinitionError("definition is not an object");
  }
  let component: CanonicalClassId;
  try {
    const parsed = parseCanonicalClassId(definition.component);
    if (parsed.kind !== "component") {
      throw new TemplateDefinitionError(
        `bound class ${JSON.stringify(definition.component)} is not a component`,
      );
    }
    component = definition.component as CanonicalClassId;
  } catch (cause) {
    if (cause instanceof TemplateDefinitionError) throw cause;
    throw new TemplateDefinitionError(
      `bound class ${JSON.stringify(definition.component)} is not a canonical component id`,
    );
  }

  const rootNames = Object.keys(definition.roots ?? {});
  if (rootNames.length === 0) {
    throw new TemplateDefinitionError("at least one named root is required");
  }
  const slotNames = new Set<string>();
  const frozenRoots: Record<string, TemplateNode> = {};
  for (const name of rootNames) {
    if (name.trim() === "") {
      throw new TemplateDefinitionError("a root name must not be blank");
    }
    frozenRoots[name] = freezeNode(
      definition.roots[name] as TemplateNode,
      slotNames,
    );
  }

  const localSlug = createLocalClassSlug(slug);
  const templateClass: TemplateClass = Object.freeze({
    kind: templateClassKind,
    localSlug,
    id: createCanonicalClassId(TEMPLATE_KIND, localSlug),
    component,
    roots: Object.freeze(frozenRoots),
    slotNames: Object.freeze([...slotNames]),
  });
  templateProvenance.add(templateClass);
  return templateClass;
}

/** Narrow an unknown value to a genuine helper-proven TemplateClass. */
export function isTemplateClass(value: unknown): value is TemplateClass {
  return (
    typeof value === "object" &&
    value !== null &&
    templateProvenance.has(value) &&
    Object.isFrozen(value)
  );
}

/** Internal: adapt a TemplateClass to its backing class definition. */
export function adaptTemplateClass(
  templateClass: TemplateClass,
): ClassDefinition<TemplateClass> {
  const definition = templateDefinitions.define(
    templateClass.localSlug,
    () => templateClass,
  );
  templateClasses.set(definition, templateClass);
  return definition;
}

/** Internal: recover a TemplateClass from its backing class definition. */
export function templateClassOf(
  definition: ClassDefinition<TemplateClass>,
): TemplateClass | undefined {
  return templateClasses.get(definition);
}

function freezeNode(node: TemplateNode, slotNames: Set<string>): TemplateNode {
  if (typeof node !== "object" || node === null) {
    throw new TemplateDefinitionError("a template node must be an object");
  }
  if (typeof node.kind !== "string" || node.kind.trim() === "") {
    throw new TemplateDefinitionError("a template node kind must not be blank");
  }
  const slots = node.slots ?? [];
  for (const slot of slots) {
    if (typeof slot.name !== "string" || slot.name.trim() === "") {
      throw new TemplateDefinitionError("a slot name must not be blank");
    }
    if (slotNames.has(slot.name)) {
      throw new TemplateDefinitionError(
        `duplicate slot name ${JSON.stringify(slot.name)}`,
      );
    }
    slotNames.add(slot.name);
  }
  const children = (node.children ?? []).map((child) =>
    freezeNode(child, slotNames),
  );
  return Object.freeze({
    kind: node.kind,
    ...(node.attributes !== undefined ? { attributes: node.attributes } : {}),
    children: Object.freeze(children),
    slots: Object.freeze(
      slots.map((slot) =>
        Object.freeze({
          name: slot.name,
          ...(slot.required !== undefined ? { required: slot.required } : {}),
        }),
      ),
    ),
  });
}
