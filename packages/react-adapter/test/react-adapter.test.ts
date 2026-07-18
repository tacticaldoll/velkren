// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createComponentRuntime,
  createComponentClass,
  createEventClass,
  createEventRuntime,
  createInteractionBinding,
  createProjectionRuntime,
  createRuntime,
  createTemplateClass,
  createTemplateRuntime,
  eventField,
  PROJECTION_IDENTITY_ATTRIBUTE,
  type InteractionFailure,
  type JsonObject,
  type RenderNode,
  type RootHandle,
} from "@velkren/core";

import {
  createReactRenderer,
  snapshotReactEvent,
  type ReactRenderer,
} from "../src/index.js";

function node(kind: string, attributes: JsonObject = {}): RenderNode {
  return { kind, attributes, children: [], slots: {} };
}

/**
 * Mount a single bound root through the full runtime so the interaction-binding
 * contract (not a raw registration) drives delivery, as the port intends.
 */
async function mountBound(options: {
  project: (snapshot: JsonObject) => unknown;
  onFailure?: (failure: InteractionFailure) => void;
}): Promise<{
  renderer: ReactRenderer;
  root: RootHandle;
  emissions: string[];
  commit(next: RenderNode): void;
  release(): Promise<void>;
  settle(): Promise<void>;
}> {
  const runtime = createRuntime({ id: "react" });
  const components = createComponentRuntime(runtime);
  const templates = createTemplateRuntime(runtime);
  const renderer = createReactRenderer();
  const projection = createProjectionRuntime(runtime, renderer);

  const clicked = createEventClass("react.clicked", {
    editor: eventField((value) => typeof value === "string"),
  });
  const emissions: string[] = [];
  const events = createEventRuntime(runtime, {
    traceSink(record) {
      if (record.classId === clicked.id && record.phase === "completed") {
        const editor = record.snapshot?.editor;
        if (typeof editor === "string") emissions.push(editor);
      }
    },
  });
  events.register(clicked);

  const widgetClass = createComponentClass("react.widget", () => ({}));
  components.register(widgetClass);
  templates.register(
    createTemplateClass(widgetClass.localSlug, {
      component: widgetClass.id,
      roots: { main: { kind: "button" } },
    }),
  );

  const interactions = createInteractionBinding(
    runtime,
    projection,
    events,
    options.onFailure === undefined ? {} : { onFailure: options.onFailure },
  );

  const instance = await components.create(widgetClass.id);
  const projected = await projection.mount(
    instance,
    templates.resolvePlan(instance),
  );
  const root = projected.roots.main;
  if (root === undefined) throw new Error("widget root was not projected");

  interactions.bind(root, "click", clicked, options.project);

  return {
    renderer,
    root,
    emissions,
    commit(next: RenderNode) {
      projection.commit(root, next);
    },
    async release() {
      await instance.release();
      await projected.release();
    },
    settle: () => interactions.settled(),
  };
}

describe("React renderer port", () => {
  // Fail the test if React (or anything) logs a dev warning/error: a future
  // keyless child, bad prop, or controlled-input mistake would otherwise slip
  // through with the suite still green. Scoped to this file only.
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

  it("mounts a plan to the DOM synchronously with its identity attribute", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot(
      "root-1",
      node("section", { role: "main" }),
    );
    // Present immediately after createRoot returns — no await (flushSync).
    const element = renderer.elementForIdentity("root-1");
    expect(element?.tagName.toLowerCase()).toBe("section");
    expect(element?.getAttribute("role")).toBe("main");
    expect(element?.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe("root-1");
    expect(renderer.readIdentity(root)).toBe("root-1");
  });

  it("translates class/for attributes and keys children", () => {
    const renderer = createReactRenderer();
    renderer.createRoot("root-1", {
      kind: "label",
      attributes: { class: "field", for: "name" },
      children: [node("input")],
      slots: {},
    });
    const element = renderer.elementForIdentity("root-1");
    expect(element?.getAttribute("class")).toBe("field");
    expect(element?.getAttribute("for")).toBe("name");
    expect(element?.firstElementChild?.tagName.toLowerCase()).toBe("input");
  });

  it("updates content and repairs a removed identity attribute on commit", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot("root-1", node("div", { state: "a" }));
    const element = renderer.elementForIdentity("root-1");
    expect(element).toBeDefined();
    if (element === undefined) return;

    element.removeAttribute(PROJECTION_IDENTITY_ATTRIBUTE);
    renderer.commit(root, "root-1", node("div", { state: "b" }));
    // Synchronous: no await. Content updated and identity restored.
    expect(element.getAttribute("state")).toBe("b");
    expect(element.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe("root-1");
    expect(renderer.readIdentity(root)).toBe("root-1");
  });

  it("snapshots a synthetic-like event without leaking the live node", () => {
    const input = document.createElement("input");
    input.value = "typed";
    const snapshot = snapshotReactEvent({
      type: "input",
      target: input,
    } as unknown as Parameters<typeof snapshotReactEvent>[0]);
    expect(snapshot).toEqual({ type: "input", value: "typed" });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("delivers a registration made after mount with no re-render", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot("root-1", node("button"));
    const element = renderer.elementForIdentity("root-1");

    let delivered: JsonObject | undefined;
    // Registered after mount, with no commit: it can only fire if the handler
    // was already wired at render time and reads the store at event time.
    renderer.registerInteraction(root, "click", (snapshot) => {
      delivered = snapshot;
    });
    // No re-render occurred: the mounted node is the very same element.
    expect(renderer.elementForIdentity("root-1")).toBe(element);

    renderer.simulateInteraction("root-1", "click");
    // A <button> exposes a string `value` (""), so the boundary snapshot copies
    // it; the snapshot is a frozen JSON object, never the live node or event.
    expect(delivered).toEqual({ type: "click", value: "" });
    expect(Object.isFrozen(delivered)).toBe(true);
  });

  it("removes a registration through its handle idempotently", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot("root-1", node("button"));
    let calls = 0;
    const registration = renderer.registerInteraction(root, "click", () => {
      calls += 1;
    });
    renderer.simulateInteraction("root-1", "click");
    expect(calls).toBe(1);

    registration.remove();
    registration.remove(); // idempotent
    renderer.simulateInteraction("root-1", "click");
    expect(calls).toBe(1);
  });

  it("delivers an input interaction through the onInput handler prop", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot("root-1", node("input"));
    const element = renderer.elementForIdentity("root-1") as HTMLInputElement;
    element.value = "typed";

    let delivered: JsonObject | undefined;
    // The other half of the type→handler-prop map: input → onInput.
    renderer.registerInteraction(root, "input", (snapshot) => {
      delivered = snapshot;
    });
    renderer.simulateInteraction("root-1", "input");
    expect(delivered).toEqual({ type: "input", value: "typed" });
    expect(Object.isFrozen(delivered)).toBe(true);
  });

  it("emits a bound semantic event through the interaction binding", async () => {
    const bound = await mountBound({ project: () => ({ editor: "one" }) });
    bound.renderer.simulateInteraction(bound.root.identity, "click");
    await bound.settle();
    expect(bound.emissions).toEqual(["one"]);
  });

  it("keeps a pre-commit registration live across a commit and full lifecycle", async () => {
    // Mount → bind (BEFORE commit) → commit a NEW node → interact → unmount.
    const bound = await mountBound({ project: () => ({ editor: "one" }) });

    // Commit a re-render with new content; the ref must survive the new tree.
    bound.commit({
      kind: "button",
      attributes: { state: "committed" },
      children: [],
      slots: {},
    });
    const element = bound.renderer.elementForIdentity(bound.root.identity);
    expect(element?.getAttribute("state")).toBe("committed");
    expect(element?.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
      bound.root.identity,
    );

    // The registration made before the commit still fires after the re-render,
    // and the bound semantic event still dispatches.
    bound.renderer.simulateInteraction(bound.root.identity, "click");
    await bound.settle();
    expect(bound.emissions).toEqual(["one"]);

    // Unmount ends the lifecycle: no further delivery, no live handler.
    await bound.release();
    bound.renderer.simulateInteraction(bound.root.identity, "click");
    await bound.settle();
    expect(bound.emissions).toEqual(["one"]);
  });

  it("surfaces a delivery-time failure through onFailure with no throw", async () => {
    const failures: InteractionFailure[] = [];
    const bound = await mountBound({
      // The bound event's schema requires a string `editor`; a number is
      // schema-invalid and must fail at delivery, not dispatch.
      project: () => ({ editor: 123 }),
      onFailure: (failure) => failures.push(failure),
    });

    // No exception escapes the synthetic-event handler.
    expect(() =>
      bound.renderer.simulateInteraction(bound.root.identity, "click"),
    ).not.toThrow();
    await bound.settle();

    expect(bound.emissions).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBe("invalid-payload");
    expect(failures[0]?.type).toBe("click");
  });

  it("leaves no live handler or registration after disposal, idempotently", async () => {
    const bound = await mountBound({ project: () => ({ editor: "one" }) });

    // Sanity: it emits while live.
    bound.renderer.simulateInteraction(bound.root.identity, "click");
    await bound.settle();
    expect(bound.emissions).toEqual(["one"]);

    await bound.release();
    // Its element is gone and no registration remains.
    expect(
      bound.renderer.elementForIdentity(bound.root.identity),
    ).toBeUndefined();
    bound.renderer.simulateInteraction(bound.root.identity, "click");
    await bound.settle();
    expect(bound.emissions).toEqual(["one"]);

    // Repeated disposal is a no-op.
    await expect(bound.release()).resolves.toBeUndefined();
    expect(bound.emissions).toEqual(["one"]);
  });
});
