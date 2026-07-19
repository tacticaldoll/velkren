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
  type TemplateNode,
} from "@velkren/core";

import { createElement } from "react";

import {
  createReactRenderer,
  snapshotNativeEvent,
  type ReactRenderer,
  type ReactView,
  type ReactViewRegistry,
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
  views?: ReactViewRegistry;
  templateRoot?: TemplateNode;
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
  const renderer =
    options.views === undefined
      ? createReactRenderer()
      : createReactRenderer({ views: options.views });
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
      roots: { main: options.templateRoot ?? { kind: "button" } },
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
    // Identity is anchored on the per-root container; content lives inside it.
    const container = renderer.elementForIdentity("root-1");
    const content = container?.firstElementChild;
    expect(content?.tagName.toLowerCase()).toBe("section");
    expect(content?.getAttribute("role")).toBe("main");
    expect(container?.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
      "root-1",
    );
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
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    expect(content?.getAttribute("class")).toBe("field");
    expect(content?.getAttribute("for")).toBe("name");
    expect(content?.firstElementChild?.tagName.toLowerCase()).toBe("input");
  });

  it("updates content and repairs a removed identity attribute on commit", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot("root-1", node("div", { state: "a" }));
    const container = renderer.elementForIdentity("root-1");
    expect(container).toBeDefined();
    if (container === undefined) return;

    container.removeAttribute(PROJECTION_IDENTITY_ATTRIBUTE);
    renderer.commit(root, "root-1", node("div", { state: "b" }));
    // Synchronous: no await. Content updated and identity restored on container.
    expect(container.firstElementChild?.getAttribute("state")).toBe("b");
    expect(container.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
      "root-1",
    );
    expect(renderer.readIdentity(root)).toBe("root-1");
  });

  it("snapshots a native event without leaking the live node", () => {
    const input = document.createElement("input");
    input.value = "typed";
    const event = new Event("input");
    Object.defineProperty(event, "target", { value: input });
    const snapshot = snapshotNativeEvent(event);
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

  it("delivers an input interaction through the container listener", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot("root-1", node("input"));
    const input = renderer.elementForIdentity("root-1")
      ?.firstElementChild as HTMLInputElement;
    input.value = "typed";

    let delivered: JsonObject | undefined;
    // A second interaction type on the same container listener: input.
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
    const container = bound.renderer.elementForIdentity(bound.root.identity);
    expect(container?.firstElementChild?.getAttribute("state")).toBe(
      "committed",
    );
    expect(container?.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
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

    // No exception escapes the container's native listener.
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

  // A registered view must CONSUME its props (read named fields), not blind-spread
  // the raw JsonObject onto a host element — that would trip React's unknown-prop
  // warning, which the console guard above turns into a hard failure.
  const Badge: ReactView = (props) =>
    createElement(
      "span",
      { title: typeof props.label === "string" ? props.label : "" },
      typeof props.label === "string" ? props.label : "",
    );

  it("renders a registered view in place of the primitive, consuming props", () => {
    const renderer = createReactRenderer({ views: { badge: Badge } });
    renderer.createRoot("root-1", node("badge", { label: "hi" }));
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    // The registered view rendered (a <span>), not a primitive <badge>, and it
    // received the node's attributes as props (label read into title + text).
    expect(content?.tagName.toLowerCase()).toBe("span");
    expect(content?.getAttribute("title")).toBe("hi");
    expect(content?.textContent).toBe("hi");
  });

  it("falls back to the primitive for an unregistered kind", () => {
    const renderer = createReactRenderer({ views: { badge: Badge } });
    renderer.createRoot("root-1", node("section", { role: "main" }));
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    expect(content?.tagName.toLowerCase()).toBe("section");
    expect(content?.getAttribute("role")).toBe("main");
  });

  it("renders the primitive path unchanged when no registry is configured", () => {
    const renderer = createReactRenderer();
    // With no registry every kind is a plain host element (a hyphenated custom
    // element so React's unrecognized-tag warning — a hard failure here — is not
    // tripped); attributes are set, no children beyond the node's own.
    renderer.createRoot("root-1", node("ui-badge", { label: "hi" }));
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    expect(content?.tagName.toLowerCase()).toBe("ui-badge");
    expect(content?.getAttribute("label")).toBe("hi");
    expect(content?.textContent).toBe("");
  });

  it("renders a registered view as a leaf, not projecting node children", () => {
    const Leaf: ReactView = (props) =>
      createElement(
        "span",
        null,
        typeof props.label === "string" ? props.label : "",
      );
    const renderer = createReactRenderer({ views: { leaf: Leaf } });
    renderer.createRoot("root-1", {
      kind: "leaf",
      attributes: { label: "solo" },
      children: [node("em"), node("strong")],
      slots: {},
    });
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    expect(content?.tagName.toLowerCase()).toBe("span");
    expect(content?.textContent).toBe("solo");
    // The node's Velkren-managed children are NOT projected into the view.
    expect(content?.querySelector("em")).toBeNull();
    expect(content?.querySelector("strong")).toBeNull();
    expect(content?.children.length).toBe(0);
  });

  it("renders and updates a registered view at the root, delivering an interaction", async () => {
    const RootButton: ReactView = (props) =>
      createElement(
        "button",
        { title: typeof props.label === "string" ? props.label : "" },
        typeof props.label === "string" ? props.label : "",
      );
    const bound = await mountBound({
      project: () => ({ editor: "one" }),
      views: { "ui.button": RootButton },
      templateRoot: { kind: "ui.button", attributes: { label: "go" } },
    });
    const container = bound.renderer.elementForIdentity(bound.root.identity);
    // The registered view renders at the ROOT (a <button>, not a <ui.button>).
    expect(container?.firstElementChild?.tagName.toLowerCase()).toBe("button");
    expect(container?.firstElementChild?.getAttribute("title")).toBe("go");

    // It updates on a subsequent commit (fresh props via React re-render).
    bound.commit({
      kind: "ui.button",
      attributes: { label: "stop" },
      children: [],
      slots: {},
    });
    expect(container?.firstElementChild?.getAttribute("title")).toBe("stop");
    // The identity anchor stays on the container across the commit.
    expect(container?.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
      bound.root.identity,
    );

    // An interaction on the registered root view's element bubbles to the
    // container's listener and delivers through the port, as for a primitive.
    bound.renderer.simulateInteraction(bound.root.identity, "click");
    await bound.settle();
    expect(bound.emissions).toEqual(["one"]);

    await bound.release();
  });
});
