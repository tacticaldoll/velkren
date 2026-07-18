import { describe, expect, it } from "vitest";

import {
  createTemplateClass,
  isTemplateClass,
  TemplateDefinitionError,
  type TemplateNode,
} from "../src/template-class.js";
import { createTemplateRuntime } from "../src/template-runtime.js";
import { createRuntime } from "../src/runtime.js";
import * as publicApi from "../src/index.js";

const validDefinition = {
  component: "component/editor.panel",
  roots: { main: { kind: "box" } },
} as const;

describe("TemplateClass definitions", () => {
  it("derives a canonical template/<slug> identity bound to a component", () => {
    const template = createTemplateClass(
      "editor.panel.default",
      validDefinition,
    );
    expect(template.id).toBe("template/editor.panel.default");
    expect(template.component).toBe("component/editor.panel");
    expect(template.kind).toBe("template");
    expect(isTemplateClass(template)).toBe(true);
    expect(Object.isFrozen(template)).toBe(true);
  });

  it("is not forgeable", () => {
    const imitation = Object.freeze({
      id: "template/editor.panel.default",
      localSlug: "editor.panel.default",
      kind: "template",
      component: "component/editor.panel",
      roots: {},
      slotNames: [],
    });
    expect(isTemplateClass(imitation)).toBe(false);
  });

  it("rejects a bound class that is not a component id", () => {
    expect(() =>
      createTemplateClass("bad", {
        component: "event/editor.saved",
        roots: { main: { kind: "box" } },
      }),
    ).toThrow(TemplateDefinitionError);
  });

  it("rejects a template with no named root or a blank root name", () => {
    expect(() =>
      createTemplateClass("empty", {
        component: "component/editor.panel",
        roots: {},
      }),
    ).toThrow(TemplateDefinitionError);
    expect(() =>
      createTemplateClass("blank", {
        component: "component/editor.panel",
        roots: { "": { kind: "box" } },
      }),
    ).toThrow(TemplateDefinitionError);
  });

  it("rejects a blank node kind and a duplicate slot name", () => {
    expect(() =>
      createTemplateClass("blank-kind", {
        component: "component/editor.panel",
        roots: { main: { kind: "  " } },
      }),
    ).toThrow(TemplateDefinitionError);

    const duplicate: TemplateNode = {
      kind: "box",
      children: [
        { kind: "a", slots: [{ name: "body" }] },
        { kind: "b", slots: [{ name: "body" }] },
      ],
    };
    expect(() =>
      createTemplateClass("dupe", {
        component: "component/editor.panel",
        roots: { main: duplicate },
      }),
    ).toThrow(TemplateDefinitionError);
  });

  it("collects declared slot names and is reusable across runtimes", () => {
    const template = createTemplateClass("editor.panel.slots", {
      component: "component/editor.panel",
      roots: {
        main: { kind: "box", slots: [{ name: "body" }, { name: "footer" }] },
      },
    });
    expect([...template.slotNames].sort()).toEqual(["body", "footer"]);

    const first = createTemplateRuntime(createRuntime({ id: "first" }));
    const second = createTemplateRuntime(createRuntime({ id: "second" }));
    const r1 = first.register(template);
    const r2 = second.register(template);
    expect(r1.id).toBe("first::template/editor.panel.slots");
    expect(r2.id).toBe("second::template/editor.panel.slots");
    expect(r1.templateClass).toBe(template);
  });

  it("exposes template APIs without generic kernels", () => {
    expect(typeof publicApi.createTemplateClass).toBe("function");
    expect(typeof publicApi.createTemplateRuntime).toBe("function");
    const names = new Set(Object.keys(publicApi));
    expect(names.has("TypedRegistry")).toBe(false);
    expect(names.has("templateClassKind")).toBe(false);
    expect(names.has("adaptTemplateClass")).toBe(false);
  });
});
