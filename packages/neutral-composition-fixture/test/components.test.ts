// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  createComponentRuntime,
  createLayoutRuntime,
  createProjectionRuntime,
  createRuntime,
  createTemplateRuntime,
  type LayoutContract,
} from "@velkren/core";
import { createSolidRenderer } from "@velkren/solid-adapter";

import { editorComponentClasses, templateFor } from "../src/index.js";

const inertLayout: LayoutContract = {
  measure() {},
  calculate() {},
  apply() {},
};

describe("minimal validation components", () => {
  it("creates, templates, and lays out each component via public contracts", async () => {
    const runtime = createRuntime({ id: "components" });
    const components = createComponentRuntime(runtime);
    const templates = createTemplateRuntime(runtime);
    const projection = createProjectionRuntime(runtime, createSolidRenderer());
    const layout = createLayoutRuntime(runtime);

    for (const componentClass of editorComponentClasses) {
      components.register(componentClass);
      templates.register(templateFor(componentClass));

      const instance = await components.create(componentClass.id);
      const plan = templates.resolvePlan(instance);
      expect(plan.templateId).toBe(`template/${componentClass.localSlug}`);

      const projected = await projection.mount(instance, plan);
      const root = projected.roots.main;
      expect(root).toBeDefined();
      if (root === undefined) continue;

      layout.register(root, inertLayout);
      layout.invalidate(root);
      expect(() => layout.flush()).not.toThrow();
      expect(root.status).toBe("active");
    }
  });
});
