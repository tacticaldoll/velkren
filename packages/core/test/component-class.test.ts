import { describe, expect, it } from "vitest";

import {
  ComponentDefinitionError,
  createComponentClass,
  isComponentClass,
} from "../src/component-class.js";
import { createComponentRuntime } from "../src/component-runtime.js";
import { DuplicateRegistrationError } from "../src/registration-errors.js";
import { createRuntime } from "../src/runtime.js";
import * as publicApi from "../src/index.js";

describe("ComponentClass definitions", () => {
  it("derives a canonical component/<slug> identity", () => {
    const panel = createComponentClass("editor.panel", () => "panel");
    expect(panel.id).toBe("component/editor.panel");
    expect(panel.localSlug).toBe("editor.panel");
    expect(panel.kind).toBe("component");
    expect(isComponentClass(panel)).toBe(true);
  });

  it("is immutable and cannot be forged", () => {
    const panel = createComponentClass("editor.panel", () => "panel");
    expect(Object.isFrozen(panel)).toBe(true);
    const imitation = Object.freeze({
      id: "component/editor.panel",
      localSlug: "editor.panel",
      kind: "component",
      create: () => "panel",
    });
    expect(isComponentClass(imitation)).toBe(false);
    expect(isComponentClass({})).toBe(false);
  });

  it("rejects a non-function creation behavior", () => {
    expect(() =>
      createComponentClass("editor.panel", undefined as never),
    ).toThrow(ComponentDefinitionError);
  });

  it("is reusable across runtimes with independent registrations", () => {
    const panel = createComponentClass("editor.panel", () => "panel");
    const first = createComponentRuntime(createRuntime({ id: "first" }));
    const second = createComponentRuntime(createRuntime({ id: "second" }));

    const firstRegistration = first.register(panel);
    const secondRegistration = second.register(panel);

    expect(firstRegistration.id).toBe("first::component/editor.panel");
    expect(secondRegistration.id).toBe("second::component/editor.panel");
    expect(firstRegistration).not.toBe(secondRegistration);
    expect(firstRegistration.componentClass).toBe(panel);
  });

  it("rejects a forged ComponentClass at registration", () => {
    const domain = createComponentRuntime(createRuntime({ id: "app" }));
    const imitation = Object.freeze({
      id: "component/editor.panel",
      localSlug: "editor.panel",
      kind: "component",
      create: () => "panel",
    });
    expect(() => domain.register(imitation as never)).toThrow(
      ComponentDefinitionError,
    );
  });

  it("rejects a duplicate active registration", () => {
    const panel = createComponentClass("editor.panel", () => "panel");
    const domain = createComponentRuntime(createRuntime({ id: "app" }));
    domain.register(panel);
    expect(() => domain.register(panel)).toThrow(DuplicateRegistrationError);
  });

  it("exposes component APIs without generic kernels through the public map", () => {
    expect(typeof publicApi.createComponentClass).toBe("function");
    expect(typeof publicApi.createComponentRuntime).toBe("function");
    const names = new Set(Object.keys(publicApi));
    expect(names.has("createDefinitionKind")).toBe(false);
    expect(names.has("TypedRegistry")).toBe(false);
    expect(names.has("ManagedFactory")).toBe(false);
    expect(names.has("componentClassKind")).toBe(false);
  });
});
