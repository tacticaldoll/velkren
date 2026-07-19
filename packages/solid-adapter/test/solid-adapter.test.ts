// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { onCleanup } from "solid-js";

import {
  createComponentClass,
  createComponentRuntime,
  createEventClass,
  createEventRuntime,
  createInteractionBinding,
  createProjectionRuntime,
  createRuntime,
  createTemplateClass,
  createTemplateRuntime,
  eventField,
  PROJECTION_IDENTITY_ATTRIBUTE,
  type JsonObject,
  type RenderNode,
  type RootHandle,
  type TemplateNode,
} from "@velkren/core";
import {
  createSolidRenderer,
  snapshotNativeEvent,
  type SolidView,
  type SolidViewRegistry,
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
  views?: SolidViewRegistry;
  templateRoot?: TemplateNode;
}): Promise<{
  renderer: ReturnType<typeof createSolidRenderer>;
  root: RootHandle;
  emissions: string[];
  commit(next: RenderNode): void;
  settle(): Promise<void>;
  release(): Promise<void>;
}> {
  const runtime = createRuntime({ id: "solid" });
  const components = createComponentRuntime(runtime);
  const templates = createTemplateRuntime(runtime);
  const renderer =
    options.views === undefined
      ? createSolidRenderer()
      : createSolidRenderer({ views: options.views });
  const projection = createProjectionRuntime(runtime, renderer);

  const clicked = createEventClass("solid.clicked", {
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

  const widgetClass = createComponentClass("solid.widget", () => ({}));
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
    {},
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
    settle: () => interactions.settled(),
    async release() {
      await instance.release();
      await projected.release();
    },
  };
}

describe("SolidJS renderer port", () => {
  it("mounts a plan to the DOM with its identity attribute", () => {
    const renderer = createSolidRenderer();
    renderer.createRoot("root-1", node("section", { role: "main" }));
    // Identity is anchored on the per-root container; content lives inside it.
    const rootContainer = renderer.container.firstElementChild as HTMLElement;
    const content = rootContainer.firstElementChild as HTMLElement;
    expect(content.tagName.toLowerCase()).toBe("section");
    expect(content.getAttribute("role")).toBe("main");
    expect(rootContainer.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
      "root-1",
    );
  });

  it("rebuilds content into the container on commit", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("div", { state: "a" }));
    renderer.commit(root, "root-1", node("div", { state: "b" }));
    await Promise.resolve();
    // Content is rebuilt into the container each commit (registry-aware helper),
    // so re-query the current child rather than holding the pre-commit element.
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.getAttribute("state")).toBe("b");
  });

  it("repairs a removed identity attribute on commit", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("div"));
    const rootContainer = renderer.container.firstElementChild as HTMLElement;
    rootContainer.removeAttribute(PROJECTION_IDENTITY_ATTRIBUTE);
    renderer.commit(root, "root-1", node("div", { state: "x" }));
    await Promise.resolve();
    expect(rootContainer.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
      "root-1",
    );
    expect(renderer.readIdentity(root)).toBe("root-1");
  });

  it("snapshots native input without leaking the live node or event", () => {
    const input = document.createElement("input");
    input.value = "typed";
    const event = new Event("input");
    Object.defineProperty(event, "target", { value: input });
    const snapshot = snapshotNativeEvent(event);
    expect(snapshot).toEqual({ type: "input", value: "typed" });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("emits a runtime semantic event from a native interaction", async () => {
    const runtime = createRuntime({ id: "solid" });
    const events = createEventRuntime(runtime);
    const changed = createEventClass("editor.changed", {
      value: eventField((value) => typeof value === "string"),
    });
    events.register(changed);

    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("input"));
    const input = renderer.container.firstElementChild
      ?.firstElementChild as HTMLInputElement;

    let pending: Promise<unknown> | undefined;
    renderer.registerInteraction(root, "input", (snapshot) => {
      pending = events.dispatch(changed.id, {
        value: typeof snapshot.value === "string" ? snapshot.value : "",
      });
    });

    input.value = "hello";
    // Bubbles from the content element to the container's native listener.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const transcript = (await pending) as ReadonlyArray<{
      phase: string;
      snapshot?: JsonObject;
    }>;

    expect(transcript.map((r) => r.phase)).toEqual([
      "created",
      "completed",
      "released",
    ]);
    expect(transcript[0]?.snapshot).toEqual({ value: "hello" });
  });

  it("removes a registration through its handle without touching others", () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("input"));
    const input = renderer.container.firstElementChild
      ?.firstElementChild as HTMLInputElement;

    let kept = 0;
    let removed = 0;
    renderer.registerInteraction(root, "input", () => {
      kept += 1;
    });
    const registration = renderer.registerInteraction(root, "input", () => {
      removed += 1;
    });

    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect([kept, removed]).toEqual([1, 1]);

    registration.remove();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect([kept, removed]).toEqual([2, 1]);
  });

  it("drives an interaction through the adapter by identity", () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("input"));
    expect(renderer.elementForIdentity("root-1")).toBeInstanceOf(HTMLElement);
    let calls = 0;
    renderer.registerInteraction(root, "click", () => {
      calls += 1;
    });
    renderer.simulateInteraction("root-1", "click");
    expect(calls).toBe(1);
  });

  it("disposes effects, listeners, and registrations on unmount", async () => {
    const runtime = createRuntime({ id: "solid" });
    const events = createEventRuntime(runtime);
    const changed = createEventClass("editor.changed", {
      value: eventField((value) => typeof value === "string"),
    });
    events.register(changed);

    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("input", { state: "a" }));

    // react — content is rebuilt on commit, so re-query the live element.
    renderer.commit(root, "root-1", node("input", { state: "b" }));
    await Promise.resolve();
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLInputElement;
    expect(content.getAttribute("state")).toBe("b");

    // emit
    let emissions = 0;
    renderer.registerInteraction(root, "input", (snapshot) => {
      emissions += 1;
      void events.dispatch(changed.id, {
        value: typeof snapshot.value === "string" ? snapshot.value : "",
      });
    });
    content.value = "one";
    content.dispatchEvent(new Event("input", { bubbles: true }));
    expect(emissions).toBe(1);

    // unmount
    renderer.removeRoot(root);
    expect(renderer.container.children.length).toBe(0);
    expect(renderer.elementForIdentity("root-1")).toBeUndefined();

    // no listener remains and no reactive effect runs after disposal
    content.dispatchEvent(new Event("input", { bubbles: true }));
    expect(emissions).toBe(1);
    // simulate on the removed identity is a no-op
    renderer.simulateInteraction("root-1", "input");
    expect(emissions).toBe(1);
    renderer.commit(root, "root-1", node("input", { state: "c" }));
    await Promise.resolve();
    expect(content.getAttribute("state")).toBe("b");
  });

  // A registered Solid view consumes the node's attributes as props and returns
  // its own DOM element (a self-contained leaf).
  const badge: SolidView = (props) => {
    const el = document.createElement("span");
    const label = typeof props.label === "string" ? props.label : "";
    el.setAttribute("data-label", label);
    el.textContent = label;
    return el;
  };

  it("renders a registered view in place of the primitive with attributes as props", () => {
    const renderer = createSolidRenderer({ views: { badge } });
    renderer.createRoot("root-1", node("badge", { label: "hi" }));
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    // The registered view rendered (a <span>), not a primitive <badge>, and it
    // received the node's attributes as props.
    expect(content.tagName.toLowerCase()).toBe("span");
    expect(content.getAttribute("data-label")).toBe("hi");
    expect(content.textContent).toBe("hi");
  });

  it("falls back to the primitive for an unregistered kind", () => {
    const renderer = createSolidRenderer({ views: { badge } });
    renderer.createRoot("root-1", node("section", { role: "main" }));
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.tagName.toLowerCase()).toBe("section");
    expect(content.getAttribute("role")).toBe("main");
  });

  it("renders the primitive path unchanged when no registry is configured", () => {
    const renderer = createSolidRenderer();
    // The same kind that would resolve to a view above is a plain host element.
    renderer.createRoot("root-1", node("badge", { label: "hi" }));
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.tagName.toLowerCase()).toBe("badge");
    expect(content.getAttribute("label")).toBe("hi");
  });

  it("renders a registered view as a leaf, not projecting node children", () => {
    const renderer = createSolidRenderer({ views: { badge } });
    renderer.createRoot("root-1", {
      kind: "badge",
      attributes: { label: "solo" },
      children: [node("em"), node("strong")],
      slots: {},
    });
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.tagName.toLowerCase()).toBe("span");
    // The node's Velkren-managed children are NOT projected into the view.
    expect(content.querySelector("em")).toBeNull();
    expect(content.querySelector("strong")).toBeNull();
    expect(content.children.length).toBe(0);
  });

  it("renders and updates a registered view at the root, delivering an interaction", async () => {
    const rootButton: SolidView = (props) => {
      const el = document.createElement("button");
      el.setAttribute(
        "data-label",
        typeof props.label === "string" ? props.label : "",
      );
      return el;
    };
    const bound = await mountBound({
      project: () => ({ editor: "one" }),
      views: { "ui.button": rootButton },
      templateRoot: { kind: "ui.button", attributes: { label: "go" } },
    });
    const container = bound.renderer.elementForIdentity(bound.root.identity);
    // The registered view renders at the ROOT (a <button>, not a <ui.button>).
    expect(container?.firstElementChild?.tagName.toLowerCase()).toBe("button");
    expect(container?.firstElementChild?.getAttribute("data-label")).toBe("go");

    // It updates on a subsequent commit (the root render effect rebuilds it).
    bound.commit({
      kind: "ui.button",
      attributes: { label: "stop" },
      children: [],
      slots: {},
    });
    await Promise.resolve();
    expect(container?.firstElementChild?.getAttribute("data-label")).toBe(
      "stop",
    );
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

  it("disposes a registered root view's reactive scope on re-run and unmount", async () => {
    const cleanups: string[] = [];
    let renders = 0;
    const reactiveView: SolidView = (props) => {
      renders += 1;
      const label = typeof props.label === "string" ? props.label : "";
      // onCleanup registers on the current reactive owner (the root's render
      // effect); it runs when that effect re-runs or the root disposes.
      onCleanup(() => cleanups.push(label));
      const el = document.createElement("div");
      el.setAttribute("data-label", label);
      return el;
    };
    const renderer = createSolidRenderer({ views: { reactive: reactiveView } });
    const root = renderer.createRoot(
      "root-1",
      node("reactive", { label: "a" }),
    );
    expect(renders).toBe(1);
    expect(cleanups).toEqual([]);

    // A commit rebuilds the view: the previous scope's onCleanup runs first,
    // then the view re-renders with fresh props (per-commit prop refresh).
    renderer.commit(root, "root-1", node("reactive", { label: "b" }));
    await Promise.resolve();
    expect(renders).toBe(2);
    expect(cleanups).toEqual(["a"]);

    // Unmount disposes the render effect, running the live view's onCleanup.
    renderer.removeRoot(root);
    expect(cleanups).toEqual(["a", "b"]);

    // No further render occurs on a would-be update after disposal.
    renderer.commit(root, "root-1", node("reactive", { label: "c" }));
    await Promise.resolve();
    expect(renders).toBe(2);
  });
});
