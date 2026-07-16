// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { ScopeResolutionError } from "@velkren/core";
import { PROJECTION_IDENTITY_ATTRIBUTE } from "@velkren/core";

import { createEditorApp } from "../src/index.js";

describe("two-editor validation", () => {
  it("keeps two editors isolated in identity, references, and scope", async () => {
    const app = createEditorApp();
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    expect(one.panel.id).not.toBe(two.panel.id);
    expect(one.field.id).not.toBe(two.field.id);
    expect(one.scope.resolve("field")).not.toBe(two.scope.resolve("field"));
    expect(one.scope.resolve("field").deref()).toBe(one.field);
    expect(one.scope.resolve("field").deref()).not.toBe(two.field);
    expect(app.container.children.length).toBe(2);
    expect(app.layoutRuns.sort()).toEqual(["one", "two"]);
  });

  it("isolates interaction between editors", async () => {
    const app = createEditorApp();
    const one = await app.createEditor("one");
    await app.createEditor("two");

    one.activate();

    expect(app.emissions).toEqual(["one"]);
  });

  it("preserves the business event after a template change", async () => {
    const app = createEditorApp();
    const one = await app.createEditor("one");

    await one.retemplate(app.altTemplate());
    expect(one.element.getAttribute("version")).toBe("2");

    one.activate();
    expect(app.emissions).toEqual(["one"]);
  });

  it("destroys one editor while the other stays functional", async () => {
    const app = createEditorApp();
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    await one.dispose();

    expect(one.panel.status).toBe("released");
    expect(one.field.status).toBe("released");
    expect(one.button.status).toBe("released");
    expect(one.projection.roots.main?.status).toBe("released");
    expect(app.container.children.length).toBe(1);
    expect(
      app.container.querySelector(
        `[${PROJECTION_IDENTITY_ATTRIBUTE}="${two.projection.roots.main?.identity ?? ""}"]`,
      ),
    ).not.toBeNull();

    // Surviving editor still reacts and emits.
    two.activate();
    expect(app.emissions).toEqual(["two"]);
    expect(two.scope.resolve("field").deref()).toBe(two.field);
  });

  it("tears down the destroyed editor's DOM and listeners without leaks", async () => {
    const app = createEditorApp();
    const one = await app.createEditor("one");
    await app.createEditor("two");

    await one.dispose();

    // The released editor's root is gone from the surface.
    expect(
      app.container.querySelector(
        `[${PROJECTION_IDENTITY_ATTRIBUTE}="${one.projection.roots.main?.identity ?? ""}"]`,
      ),
    ).toBeNull();
    // Its listener is gone: re-dispatching on the detached element does nothing.
    one.activate();
    expect(app.emissions).toEqual([]);
    // Its scope no longer resolves a live target.
    expect(() => one.scope.resolve("missing")).toThrow(ScopeResolutionError);
  });
});
