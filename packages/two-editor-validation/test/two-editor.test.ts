// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { ScopeResolutionError } from "@velkren/core";
import { createSolidRenderer } from "@velkren/solid-adapter";

import { createEditorApp } from "../src/index.js";

describe("two-editor validation", () => {
  it("keeps two editors isolated in identity, references, and scope", async () => {
    const renderer = createSolidRenderer();
    const app = createEditorApp(renderer);
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    expect(one.panel.id).not.toBe(two.panel.id);
    expect(one.field.id).not.toBe(two.field.id);
    expect(one.root.identity).not.toBe(two.root.identity);
    expect(one.scope.resolve("field")).not.toBe(two.scope.resolve("field"));
    expect(one.scope.resolve("field").deref()).toBe(one.field);
    expect(one.scope.resolve("field").deref()).not.toBe(two.field);
    expect(renderer.container.children.length).toBe(2);
    expect(app.layoutRuns.sort()).toEqual(["one", "two"]);
  });

  it("flows the business event through the binding, isolated per editor", async () => {
    const renderer = createSolidRenderer();
    const app = createEditorApp(renderer);
    const one = await app.createEditor("one");
    await app.createEditor("two");

    await one.activate();

    // Observed through the event trace: no DOM query or native listener here.
    expect(app.emissions).toEqual(["one"]);
  });

  it("preserves the business event after a template change", async () => {
    const renderer = createSolidRenderer();
    const app = createEditorApp(renderer);
    const one = await app.createEditor("one");

    await one.retemplate(app.altTemplate());
    const element = renderer.elementForIdentity(
      one.root.identity,
    ) as HTMLElement;
    expect(element.getAttribute("version")).toBe("2");

    // Same root, unchanged binding: the business event still fires.
    await one.activate();
    expect(app.emissions).toEqual(["one"]);
  });

  it("destroys one editor while the other stays functional", async () => {
    const renderer = createSolidRenderer();
    const app = createEditorApp(renderer);
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    await one.dispose();

    expect(one.panel.status).toBe("released");
    expect(one.field.status).toBe("released");
    expect(one.button.status).toBe("released");
    expect(one.projection.roots.main?.status).toBe("released");
    expect(renderer.container.children.length).toBe(1);
    const twoElement = renderer.elementForIdentity(
      two.root.identity,
    ) as HTMLElement;
    expect(renderer.container.contains(twoElement)).toBe(true);

    // Surviving editor still reacts and emits.
    await two.activate();
    expect(app.emissions).toEqual(["two"]);
    expect(two.scope.resolve("field").deref()).toBe(two.field);
  });

  it("tears down the destroyed editor's DOM and registration without leaks", async () => {
    const renderer = createSolidRenderer();
    const app = createEditorApp(renderer);
    const one = await app.createEditor("one");
    await app.createEditor("two");

    const oneIdentity = one.root.identity;
    await one.dispose();

    // The released editor's root is gone from the surface.
    expect(renderer.elementForIdentity(oneIdentity)).toBeUndefined();
    // Its interaction registration is gone: activating again emits nothing.
    await one.activate();
    expect(app.emissions).toEqual([]);
    // Its scope no longer resolves a live target.
    expect(() => one.scope.resolve("missing")).toThrow(ScopeResolutionError);
  });
});
