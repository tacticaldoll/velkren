// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createEditorApp } from "@velkren/two-editor-validation";

import { createReactRenderer } from "../src/index.js";

describe("two-editor validation on React", () => {
  // Fail on any React dev warning/error during the validation. Scoped here only.
  const consoleErrors: unknown[][] = [];
  const consoleWarns: unknown[][] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  beforeEach(() => {
    consoleErrors.length = 0;
    consoleWarns.length = 0;
    console.error = (...args: unknown[]): void => {
      consoleErrors.push(args);
    };
    console.warn = (...args: unknown[]): void => {
      consoleWarns.push(args);
    };
  });
  afterEach(() => {
    console.error = originalError;
    console.warn = originalWarn;
    expect(consoleErrors).toEqual([]);
    expect(consoleWarns).toEqual([]);
  });

  it("keeps two editors isolated in identity and layout", async () => {
    // The same renderer-agnostic composition, with the React renderer injected.
    const renderer = createReactRenderer();
    const app = createEditorApp(renderer);
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    const oneIdentity = one.root.identity;
    const twoIdentity = two.root.identity;
    expect(oneIdentity).not.toBe(twoIdentity);
    expect(one.panel.id).not.toBe(two.panel.id);
    expect(one.field.id).not.toBe(two.field.id);
    // React DOM-specific assertion, kept local to this adapter's test.
    expect(renderer.elementForIdentity(oneIdentity)).toBeInstanceOf(
      HTMLElement,
    );
    expect(renderer.elementForIdentity(twoIdentity)).toBeInstanceOf(
      HTMLElement,
    );
    expect(app.layoutRuns.sort()).toEqual(["one", "two"]);
  });

  it("flows each editor's business event through the binding, isolated", async () => {
    const renderer = createReactRenderer();
    const app = createEditorApp(renderer);
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    await one.activate();
    // Observed through the event trace: no DOM query or native listener here.
    expect(app.emissions).toEqual(["one"]);

    await two.activate();
    expect(app.emissions).toEqual(["one", "two"]);
  });

  it("destroys one editor while the other stays functional", async () => {
    const renderer = createReactRenderer();
    const app = createEditorApp(renderer);
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    const oneIdentity = one.root.identity;
    const twoIdentity = two.root.identity;
    await one.dispose();

    expect(one.panel.status).toBe("released");
    expect(one.field.status).toBe("released");
    expect(one.button.status).toBe("released");
    expect(one.projection.roots.main?.status).toBe("released");

    // Only the destroyed editor's root/registration is released. React
    // DOM-specific assertions, kept local to this adapter's test.
    expect(renderer.elementForIdentity(oneIdentity)).toBeUndefined();
    expect(renderer.elementForIdentity(twoIdentity)).toBeInstanceOf(
      HTMLElement,
    );

    // The destroyed editor emits nothing; the survivor still emits.
    await one.activate();
    expect(app.emissions).toEqual([]);
    await two.activate();
    expect(app.emissions).toEqual(["two"]);
  });
});
