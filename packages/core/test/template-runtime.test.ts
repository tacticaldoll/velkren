import { describe, expect, it } from "vitest";

import { createComponentClass } from "../src/component-class.js";
import { createComponentRuntime } from "../src/component-runtime.js";
import {
  createTemplateClass,
  DuplicateTemplateBindingError,
  DuplicateTemplateRuntimeError,
  RenderPlanError,
  TemplateResolutionError,
  type TemplateDefinition,
} from "../src/template-class.js";
import { createTemplateRuntime } from "../src/template-runtime.js";
import { OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";

function harness(id = "app") {
  const runtime = createRuntime({ id });
  return {
    runtime,
    components: createComponentRuntime(runtime),
    templates: createTemplateRuntime(runtime),
  };
}

function panelClass() {
  return createComponentClass("editor.panel", () => "panel");
}

async function panelInstance(
  components: ReturnType<typeof harness>["components"],
) {
  return components.create(components.register(panelClass()));
}

const bodyTemplate: TemplateDefinition = {
  component: "component/editor.panel",
  roots: {
    main: {
      kind: "box",
      attributes: { role: "main" },
      slots: [{ name: "body" }],
      children: [{ kind: "text" }],
    },
  },
};

describe("template registration and binding", () => {
  it("rejects a duplicate binding for the same component class", () => {
    const { templates } = harness();
    templates.register(createTemplateClass("editor.panel.a", bodyTemplate));
    expect(() =>
      templates.register(
        createTemplateClass("editor.panel.b", {
          component: "component/editor.panel",
          roots: { main: { kind: "box" } },
        }),
      ),
    ).toThrow(DuplicateTemplateBindingError);
  });

  it("replaces the bound template and resolves the new structure", async () => {
    const { components, templates } = harness();
    templates.register(
      createTemplateClass("editor.panel.default", {
        component: "component/editor.panel",
        roots: { main: { kind: "old" } },
      }),
    );
    await templates.replace(
      createTemplateClass("editor.panel.default", {
        component: "component/editor.panel",
        roots: { main: { kind: "new" } },
      }),
    );
    const instance = await panelInstance(components);
    expect(templates.resolvePlan(instance).roots.main?.kind).toBe("new");
  });
});

describe("deterministic resolution and render plans", () => {
  it("resolves the bound template for a matching instance", async () => {
    const { components, templates } = harness();
    templates.register(
      createTemplateClass("editor.panel.default", bodyTemplate),
    );
    const instance = await panelInstance(components);
    const plan = templates.resolvePlan(instance, { body: { content: "hi" } });
    expect(plan.templateId).toBe("template/editor.panel.default");
    expect(plan.instanceId).toBe(instance.id);
    expect(plan.roots.main?.kind).toBe("box");
    expect(plan.roots.main?.attributes).toEqual({ role: "main" });
  });

  it("fails explicitly when no template is bound", async () => {
    const { components, templates } = harness();
    const instance = await panelInstance(components);
    expect(() => templates.resolvePlan(instance)).toThrow(
      TemplateResolutionError,
    );
  });

  it("rejects a foreign-runtime instance before selecting a template", async () => {
    const first = harness("first");
    const second = harness("second");
    first.templates.register(
      createTemplateClass("editor.panel.default", bodyTemplate),
    );
    const foreign = await panelInstance(second.components);
    expect(() =>
      first.templates.resolvePlan(foreign, { body: { content: 1 } }),
    ).toThrow(OwnershipError);
  });

  it("produces an immutable multi-root plan", async () => {
    const { components, templates } = harness();
    templates.register(
      createTemplateClass("editor.panel.default", {
        component: "component/editor.panel",
        roots: { main: { kind: "box" }, aside: { kind: "rail" } },
      }),
    );
    const instance = await panelInstance(components);
    const plan = templates.resolvePlan(instance);
    expect(Object.keys(plan.roots).sort()).toEqual(["aside", "main"]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.roots.main)).toBe(true);
    expect(() => {
      (plan.roots as Record<string, unknown>).extra = {};
    }).toThrow();
  });

  it("rejects non-JSON attributes at resolution", async () => {
    const { components, templates } = harness();
    templates.register(
      createTemplateClass("editor.panel.default", {
        component: "component/editor.panel",
        roots: {
          main: { kind: "box", attributes: { bad: (() => 1) as never } },
        },
      }),
    );
    const instance = await panelInstance(components);
    expect(() => templates.resolvePlan(instance)).toThrow(RenderPlanError);
  });
});

describe("slot resolution", () => {
  it("resolves a filled slot to a reference, not a live instance", async () => {
    const { components, templates } = harness();
    templates.register(
      createTemplateClass("editor.panel.default", bodyTemplate),
    );
    const instance = await panelInstance(components);
    const child = await components.create(
      components.register(createComponentClass("editor.field", () => "field")),
    );
    const reference = components.reference(child);
    const plan = templates.resolvePlan(instance, { body: reference });
    const slot = plan.roots.main?.slots.body;
    expect(slot?.kind).toBe("reference");
    expect(slot?.kind === "reference" && slot.reference).toBe(reference);
    expect(slot?.kind === "reference" && slot.reference.deref()).toBe(child);
  });

  it("rejects a foreign-runtime reference in a slot", async () => {
    const first = harness("first");
    const second = harness("second");
    first.templates.register(
      createTemplateClass("editor.panel.default", bodyTemplate),
    );
    const instance = await panelInstance(first.components);
    const foreignChild = await second.components.create(
      second.components.register(
        createComponentClass("editor.field", () => "field"),
      ),
    );
    const foreignReference = second.components.reference(foreignChild);
    expect(() =>
      first.templates.resolvePlan(instance, { body: foreignReference }),
    ).toThrow(OwnershipError);
  });

  it("rejects unknown, duplicate, and unfilled required slots", async () => {
    const { components, templates } = harness();
    templates.register(
      createTemplateClass("editor.panel.default", bodyTemplate),
    );
    const instance = await panelInstance(components);

    // Unfilled required slot.
    expect(() => templates.resolvePlan(instance)).toThrow(RenderPlanError);
    // Unknown slot fill.
    expect(() =>
      templates.resolvePlan(instance, {
        body: { content: 1 },
        nope: { content: 2 },
      }),
    ).toThrow(RenderPlanError);
    // Duplicate fill for the same slot.
    expect(() =>
      templates.resolvePlan(instance, [
        ["body", { content: 1 }],
        ["body", { content: 2 }],
      ]),
    ).toThrow(RenderPlanError);
  });

  it("omits an unfilled optional slot", async () => {
    const { components, templates } = harness();
    templates.register(
      createTemplateClass("editor.panel.default", {
        component: "component/editor.panel",
        roots: {
          main: { kind: "box", slots: [{ name: "footer", required: false }] },
        },
      }),
    );
    const instance = await panelInstance(components);
    const plan = templates.resolvePlan(instance);
    expect(plan.roots.main?.slots).toEqual({});
  });
});

describe("explanation and boundary", () => {
  it("explains a selected template as immutable data", async () => {
    const { components, templates } = harness();
    templates.register(
      createTemplateClass("editor.panel.default", bodyTemplate),
    );
    const instance = await panelInstance(components);
    const explanation = templates.explainPlan(instance);
    expect(explanation.bound).toBe(true);
    expect(explanation.templateId).toBe("template/editor.panel.default");
    expect(explanation.componentClassId).toBe("component/editor.panel");
    expect(explanation.roots).toEqual(["main"]);
    expect(explanation.slots).toEqual(["body"]);
    expect(Object.isFrozen(explanation)).toBe(true);
  });

  it("explains an unresolved instance without throwing", async () => {
    const { components, templates } = harness();
    const instance = await panelInstance(components);
    const explanation = templates.explainPlan(instance);
    expect(explanation.bound).toBe(false);
    expect(explanation.templateId).toBeNull();
    expect(explanation.roots).toEqual([]);
  });

  it("allows only one template domain per runtime", () => {
    const runtime = createRuntime({ id: "app" });
    createTemplateRuntime(runtime);
    expect(() => createTemplateRuntime(runtime)).toThrow(
      DuplicateTemplateRuntimeError,
    );
  });
});
