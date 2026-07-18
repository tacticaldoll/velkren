// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createComponentClass,
  createComponentRuntime,
  createEventClass,
  createEventRuntime,
  createInteractionBinding,
  createLayoutRuntime,
  createProjectionRuntime,
  createRuntime,
  createTemplateClass,
  createTemplateRuntime,
  eventField,
  type ComponentInstance,
  type LayoutContract,
  type Projection,
  type RootHandle,
} from "@velkren/core";

import { createReactRenderer, type ReactRenderer } from "../src/index.js";

/** The interaction type a Button reports; captured through the adapter. */
const BUTTON_INTERACTION = "click";

/** The minimal validation component set. Fixtures, not a public UI library. */
const panelClass = createComponentClass("react.editor.panel", () => ({}));
const fieldClass = createComponentClass("react.editor.field", () => ({
  value: "",
}));
const buttonClass = createComponentClass("react.editor.button", () => ({}));

function panelTemplate() {
  return createTemplateClass("react.editor.panel.default", {
    component: panelClass.id,
    roots: {
      main: {
        kind: "section",
        attributes: {},
        children: [{ kind: "input" }, { kind: "button" }],
      },
    },
  });
}

interface ReactEditor {
  readonly id: string;
  readonly panel: ComponentInstance;
  readonly field: ComponentInstance;
  readonly button: ComponentInstance;
  readonly projection: Projection;
  readonly root: RootHandle;
  readonly element: HTMLElement;
  activate(): Promise<void>;
  dispose(): Promise<void>;
}

interface ReactEditorApp {
  readonly renderer: ReactRenderer;
  readonly emissions: string[];
  readonly layoutRuns: string[];
  createEditor(id: string): Promise<ReactEditor>;
}

/** Compose every runtime domain through the React adapter (parallel proof). */
function createReactEditorApp(): ReactEditorApp {
  const runtime = createRuntime({ id: "react-validation" });
  const components = createComponentRuntime(runtime);
  const templates = createTemplateRuntime(runtime);

  const submitted = createEventClass("react.editor.submitted", {
    editor: eventField((value) => typeof value === "string"),
  });

  const emissions: string[] = [];
  // Observe the business event through the event domain's own trace, never a
  // DOM listener attached by this validation.
  const events = createEventRuntime(runtime, {
    traceSink(record) {
      if (record.classId === submitted.id && record.phase === "completed") {
        const editor = record.snapshot?.editor;
        if (typeof editor === "string") emissions.push(editor);
      }
    },
  });
  events.register(submitted);

  const renderer = createReactRenderer();
  const projection = createProjectionRuntime(runtime, renderer);
  const layout = createLayoutRuntime(runtime);
  const interactions = createInteractionBinding(runtime, projection, events);

  components.register(panelClass);
  components.register(fieldClass);
  components.register(buttonClass);
  templates.register(panelTemplate());

  const layoutRuns: string[] = [];
  const stackContract = (id: string): LayoutContract => ({
    measure(ctx) {
      ctx.scratch.measured = true;
    },
    calculate(ctx) {
      ctx.scratch.calculated = ctx.scratch.measured === true;
    },
    apply(ctx) {
      if (ctx.scratch.calculated === true) layoutRuns.push(id);
    },
  });

  async function createEditor(id: string): Promise<ReactEditor> {
    const panel = await components.create(panelClass.id);
    const field = await components.create(fieldClass.id);
    const button = await components.create(buttonClass.id);
    components.attach(panel, field);
    components.attach(panel, button);

    const projected = await projection.mount(
      panel,
      templates.resolvePlan(panel),
    );
    const root = projected.roots.main;
    if (root === undefined) throw new Error("panel root was not projected");

    const element = renderer.elementForIdentity(root.identity);
    if (element === undefined)
      throw new Error("projected root element missing");

    // Route the Button interaction through the neutral port and binding: no
    // data-velkren-root selector, no application-attached native listener.
    interactions.bind(root, BUTTON_INTERACTION, submitted, () => ({
      editor: id,
    }));

    layout.register(root, stackContract(id));
    layout.invalidate(root);
    layout.flush();

    let disposed = false;
    return {
      id,
      panel,
      field,
      button,
      projection: projected,
      root,
      element,
      async activate() {
        renderer.simulateInteraction(root.identity, BUTTON_INTERACTION);
        await interactions.settled();
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        await panel.release();
        await projected.release();
        layout.flush();
      },
    };
  }

  return { renderer, emissions, layoutRuns, createEditor };
}

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
    const app = createReactEditorApp();
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    expect(one.root.identity).not.toBe(two.root.identity);
    expect(one.panel.id).not.toBe(two.panel.id);
    expect(one.field.id).not.toBe(two.field.id);
    expect(app.renderer.elementForIdentity(one.root.identity)).toBeInstanceOf(
      HTMLElement,
    );
    expect(app.renderer.elementForIdentity(two.root.identity)).toBeInstanceOf(
      HTMLElement,
    );
    expect(app.layoutRuns.sort()).toEqual(["one", "two"]);
  });

  it("flows each editor's business event through the binding, isolated", async () => {
    const app = createReactEditorApp();
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    await one.activate();
    // Observed through the event trace: no DOM query or native listener here.
    expect(app.emissions).toEqual(["one"]);

    await two.activate();
    expect(app.emissions).toEqual(["one", "two"]);
  });

  it("destroys one editor while the other stays functional", async () => {
    const app = createReactEditorApp();
    const one = await app.createEditor("one");
    const two = await app.createEditor("two");

    await one.dispose();

    expect(one.panel.status).toBe("released");
    expect(one.field.status).toBe("released");
    expect(one.button.status).toBe("released");
    expect(one.projection.roots.main?.status).toBe("released");

    // Only the destroyed editor's root/registration is released.
    expect(app.renderer.elementForIdentity(one.root.identity)).toBeUndefined();
    expect(app.renderer.elementForIdentity(two.root.identity)).toBeInstanceOf(
      HTMLElement,
    );

    // The destroyed editor emits nothing; the survivor still emits.
    await one.activate();
    expect(app.emissions).toEqual([]);
    await two.activate();
    expect(app.emissions).toEqual(["two"]);
  });
});
