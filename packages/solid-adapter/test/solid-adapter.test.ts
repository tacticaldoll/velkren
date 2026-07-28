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

function viewNode(viewId: string, props: JsonObject = {}): RenderNode {
  return { node: "view", viewId, props };
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

  it("updates content in the container on commit", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("div", { state: "a" }));
    renderer.commit(root, "root-1", node("div", { state: "b" }));
    await Promise.resolve();
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.getAttribute("state")).toBe("b");
  });

  it("preserves an unchanged primitive element across a commit", async () => {
    const renderer = createSolidRenderer();
    const tree = (value: string): RenderNode => ({
      kind: "div",
      attributes: {},
      slots: {},
      children: [
        { kind: "input", attributes: { value }, children: [], slots: {} },
      ],
    });
    const root = renderer.createRoot("root-1", tree("a"));
    const container = renderer.container.firstElementChild as HTMLElement;
    const inputBefore = container.querySelector("input");
    renderer.commit(root, "root-1", tree("b"));
    await Promise.resolve();
    const inputAfter = container.querySelector("input");
    // The input is the SAME DOM node (reconciled in place), not rebuilt — so a
    // user's focus and caret survive a state-driven re-commit. `value` is
    // managed as a live DOM property (not an attribute — getAttribute("value")
    // is never set at all), so the assertion reads the property.
    expect(inputAfter).toBe(inputBefore);
    expect(inputAfter?.value).toBe("b");
    expect(inputAfter?.getAttribute("value")).toBeNull();
  });

  it("does not overwrite a user-typed value once the field is dirty", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("input", { value: "a" }));
    const input = renderer.container.firstElementChild
      ?.firstElementChild as HTMLInputElement;
    expect(input.value).toBe("a");

    // The user types, setting the HTML "dirty value flag": from this point,
    // setAttribute("value", ...) alone would never reach the live property.
    input.value = "typed by user";
    // A same-value re-commit (the common echo-back case) must not disturb it.
    renderer.commit(root, "root-1", node("input", { value: "typed by user" }));
    await Promise.resolve();
    expect(input.value).toBe("typed by user");

    // A genuinely different, state-driven value still reaches the property.
    renderer.commit(root, "root-1", node("input", { value: "external" }));
    await Promise.resolve();
    expect(input.value).toBe("external");
  });

  it("skips a redundant assignment and preserves the caret on a same-value re-commit", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot(
      "root-1",
      node("input", { value: "hello" }),
    );
    const input = renderer.container.firstElementChild
      ?.firstElementChild as HTMLInputElement;
    input.setSelectionRange(2, 2);

    renderer.commit(root, "root-1", node("input", { value: "hello" }));
    await Promise.resolve();

    expect(input.value).toBe("hello");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it("restores the selection range (clamped to the new length) across a real value change", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot(
      "root-1",
      node("input", { value: "hello" }),
    );
    const input = renderer.container.firstElementChild
      ?.firstElementChild as HTMLInputElement;
    input.setSelectionRange(3, 5);

    renderer.commit(root, "root-1", node("input", { value: "hi" }));
    await Promise.resolve();

    expect(input.value).toBe("hi");
    expect(input.selectionStart).toBe(2); // clamped to the new length
    expect(input.selectionEnd).toBe(2);
  });

  it("applies a value crossing without throwing on an input type that rejects selection", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", {
      kind: "input",
      attributes: { type: "number", value: "1" },
      children: [],
      slots: {},
    });
    const input = renderer.container.firstElementChild
      ?.firstElementChild as HTMLInputElement;
    expect(input.value).toBe("1");

    expect(() => {
      renderer.commit(root, "root-1", {
        kind: "input",
        attributes: { type: "number", value: "2" },
        children: [],
        slots: {},
      });
    }).not.toThrow();
    await Promise.resolve();
    expect(input.value).toBe("2");
  });

  it("clears the value property when a later commit removes the value attribute", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("input", { value: "a" }));
    const input = renderer.container.firstElementChild
      ?.firstElementChild as HTMLInputElement;
    expect(input.value).toBe("a");

    renderer.commit(root, "root-1", node("input"));
    await Promise.resolve();
    expect(input.value).toBe("");
  });

  it("does not treat a non-form element's value as a controlled DOM property", async () => {
    // <li>'s `value` IDL property is a *numeric* WebIDL long, not a string:
    // assigning through it (rather than setAttribute) would silently coerce
    // "abc" to 0. Only input/textarea/select get the property-based crossing.
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("li", { value: "abc" }));
    const li = renderer.container.firstElementChild
      ?.firstElementChild as HTMLLIElement;
    expect(li.getAttribute("value")).toBe("abc");

    renderer.commit(root, "root-1", node("li", { value: "def" }));
    await Promise.resolve();
    expect(li.getAttribute("value")).toBe("def");
  });

  it("reconciles children in place: patch, append, and remove", async () => {
    const renderer = createSolidRenderer();
    const div = (
      children: { kind: string; name: string }[],
      v: string,
    ): RenderNode => ({
      kind: "div",
      attributes: { v },
      slots: {},
      children: children.map((c) => ({
        kind: c.kind,
        attributes: { name: c.name },
        children: [],
        slots: {},
      })),
    });
    const root = renderer.createRoot(
      "root-1",
      div([{ kind: "input", name: "a" }], "1"),
    );
    const container = renderer.container.firstElementChild as HTMLElement;
    const parent = container.firstElementChild as HTMLElement;
    const input = parent.querySelector("input");

    // Patch parent attr + patch kept child attr + append a new child.
    renderer.commit(
      root,
      "root-1",
      div(
        [
          { kind: "input", name: "a2" },
          { kind: "span", name: "s" },
        ],
        "2",
      ),
    );
    await Promise.resolve();
    expect(container.firstElementChild).toBe(parent); // parent preserved
    expect(parent.getAttribute("v")).toBe("2"); // parent attr patched
    expect(parent.querySelector("input")).toBe(input); // child preserved
    expect(input?.getAttribute("name")).toBe("a2"); // child attr patched
    expect(parent.children.length).toBe(2); // child appended
    expect(parent.children[1]?.tagName.toLowerCase()).toBe("span");

    // Remove the appended child; the kept input stays the same node.
    renderer.commit(root, "root-1", div([{ kind: "input", name: "a2" }], "2"));
    await Promise.resolve();
    expect(parent.children.length).toBe(1);
    expect(parent.querySelector("input")).toBe(input);
  });

  it("removes a dropped attribute on commit", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot(
      "root-1",
      node("div", { keep: "1", drop: "2" }),
    );
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    renderer.commit(root, "root-1", node("div", { keep: "1" }));
    await Promise.resolve();
    expect(content.getAttribute("keep")).toBe("1");
    expect(content.hasAttribute("drop")).toBe(false);
    // Same element, patched in place rather than rebuilt.
    expect(renderer.container.firstElementChild?.firstElementChild).toBe(
      content,
    );
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

    // react — content is patched in place on commit; re-query the live element.
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

  it("renders a registered view in place of the primitive with props as props", () => {
    const renderer = createSolidRenderer({ views: { badge } });
    renderer.createRoot("root-1", viewNode("badge", { label: "hi" }));
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    // The registered view rendered (a <span>), not a primitive <badge>, and it
    // received the node's props as props.
    expect(content.tagName.toLowerCase()).toBe("span");
    expect(content.getAttribute("data-label")).toBe("hi");
    expect(content.textContent).toBe("hi");
  });

  it("throws a clear error for an unregistered viewId", () => {
    const renderer = createSolidRenderer({ views: { badge } });
    expect(() =>
      renderer.createRoot("root-1", viewNode("no-such-view")),
    ).toThrow(/no view registered for viewId/);
  });

  it("a primitive node whose kind coincidentally matches a registry key still renders as a primitive", () => {
    const renderer = createSolidRenderer({ views: { badge } });
    // "badge" is a registered viewId above, but this is a primitive node
    // (carrying `kind`, not `node: "view"`), so the registry is never
    // consulted for it.
    renderer.createRoot("root-1", node("badge", { label: "hi" }));
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.tagName.toLowerCase()).toBe("badge");
    expect(content.getAttribute("label")).toBe("hi");
  });

  it("renders the primitive path unchanged when no registry is configured", () => {
    const renderer = createSolidRenderer();
    renderer.createRoot("root-1", node("badge", { label: "hi" }));
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.tagName.toLowerCase()).toBe("badge");
    expect(content.getAttribute("label")).toBe("hi");
  });

  it("renders a registered view as a leaf (a view node has no children of its own)", () => {
    const renderer = createSolidRenderer({ views: { badge } });
    renderer.createRoot("root-1", viewNode("badge", { label: "solo" }));
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.tagName.toLowerCase()).toBe("span");
    expect(content.children.length).toBe(0);
  });

  it("rebuilds rather than patches across a primitive<->view variant change on commit", async () => {
    const renderer = createSolidRenderer({ views: { badge } });
    const root = renderer.createRoot("root-1", node("span", { label: "a" }));
    renderer.commit(root, "root-1", viewNode("badge", { label: "b" }));
    await Promise.resolve();
    const content = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(content.tagName.toLowerCase()).toBe("span");
    expect(content.getAttribute("data-label")).toBe("b");
    renderer.commit(root, "root-1", node("em", { label: "c" }));
    await Promise.resolve();
    const back = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(back.tagName.toLowerCase()).toBe("em");
  });

  it("reconciles a non-root child that alternates primitive<->view across commits", async () => {
    const renderer = createSolidRenderer({ views: { badge } });
    const wrap = (child: RenderNode): RenderNode => ({
      kind: "div",
      attributes: {},
      children: [child],
      slots: {},
    });
    const root = renderer.createRoot(
      "root-1",
      wrap(node("span", { label: "a" })),
    );
    const wrapper = renderer.container.firstElementChild
      ?.firstElementChild as HTMLElement;

    renderer.commit(root, "root-1", wrap(viewNode("badge", { label: "b" })));
    await Promise.resolve();
    expect(wrapper.firstElementChild?.tagName.toLowerCase()).toBe("span");
    expect(wrapper.firstElementChild?.getAttribute("data-label")).toBe("b");

    renderer.commit(root, "root-1", wrap(node("em", { label: "c" })));
    await Promise.resolve();
    expect(wrapper.firstElementChild?.tagName.toLowerCase()).toBe("em");
    expect(wrapper.firstElementChild?.getAttribute("label")).toBe("c");
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
      templateRoot: {
        node: "view",
        viewId: "ui.button",
        props: { label: "go" },
      },
    });
    const container = bound.renderer.elementForIdentity(bound.root.identity);
    // The registered view renders at the ROOT (a <button>, not a <ui.button>).
    expect(container?.firstElementChild?.tagName.toLowerCase()).toBe("button");
    expect(container?.firstElementChild?.getAttribute("data-label")).toBe("go");

    // It updates on a subsequent commit (the root render effect rebuilds it).
    bound.commit(viewNode("ui.button", { label: "stop" }));
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
      viewNode("reactive", { label: "a" }),
    );
    expect(renders).toBe(1);
    expect(cleanups).toEqual([]);

    // A commit rebuilds the view: the previous scope's onCleanup runs first,
    // then the view re-renders with fresh props (per-commit prop refresh).
    renderer.commit(root, "root-1", viewNode("reactive", { label: "b" }));
    await Promise.resolve();
    expect(renders).toBe(2);
    expect(cleanups).toEqual(["a"]);

    // Unmount disposes the render effect, running the live view's onCleanup.
    renderer.removeRoot(root);
    expect(cleanups).toEqual(["a", "b"]);

    // No further render occurs on a would-be update after disposal.
    renderer.commit(root, "root-1", viewNode("reactive", { label: "c" }));
    await Promise.resolve();
    expect(renders).toBe(2);
  });

  describe("keyed child reconciliation", () => {
    function listOf(
      items: readonly { key: string; label: string }[],
    ): RenderNode {
      return {
        kind: "ul",
        attributes: {},
        slots: {},
        children: items.map((item) => ({
          kind: "li",
          attributes: { label: item.label },
          children: [],
          slots: {},
          key: item.key,
        })),
      };
    }

    it("preserves each key's DOM element (and live focus) across a reorder", async () => {
      const renderer = createSolidRenderer();
      const root = renderer.createRoot(
        "root-1",
        listOf([
          { key: "a", label: "Alice" },
          { key: "b", label: "Bob" },
          { key: "c", label: "Carol" },
        ]),
      );
      const list = renderer.container.firstElementChild
        ?.firstElementChild as HTMLElement;
      const [elA, elB, elC] = Array.from(list.children) as HTMLElement[];
      // Give "b"'s element a live property a rebuild would not preserve.
      (elB as HTMLElement & { marker?: string }).marker = "still-bob";

      renderer.commit(
        root,
        "root-1",
        listOf([
          { key: "c", label: "Carol" },
          { key: "a", label: "Alice" },
          { key: "b", label: "Bob" },
        ]),
      );
      await Promise.resolve();

      const reordered = Array.from(list.children) as HTMLElement[];
      expect(reordered.map((el) => el.getAttribute("label"))).toEqual([
        "Carol",
        "Alice",
        "Bob",
      ]);
      expect(reordered[0]).toBe(elC);
      expect(reordered[1]).toBe(elA);
      expect(reordered[2]).toBe(elB);
      expect((reordered[2] as HTMLElement & { marker?: string }).marker).toBe(
        "still-bob",
      );
    });

    it("inserts and removes by key, leaving untouched keys' elements alone", async () => {
      const renderer = createSolidRenderer();
      const root = renderer.createRoot(
        "root-1",
        listOf([
          { key: "a", label: "Alice" },
          { key: "b", label: "Bob" },
        ]),
      );
      const list = renderer.container.firstElementChild
        ?.firstElementChild as HTMLElement;
      const [elA] = Array.from(list.children) as HTMLElement[];

      renderer.commit(
        root,
        "root-1",
        listOf([
          { key: "a", label: "Alice" },
          { key: "c", label: "Carol" },
        ]),
      );
      await Promise.resolve();

      const next = Array.from(list.children) as HTMLElement[];
      expect(next.map((el) => el.getAttribute("label"))).toEqual([
        "Alice",
        "Carol",
      ]);
      // "a"'s element is untouched by the removal of "b" and insertion of "c".
      expect(next[0]).toBe(elA);
    });

    it("removes every stale element when a children array transitions from unkeyed to keyed", async () => {
      const renderer = createSolidRenderer();
      const root = renderer.createRoot("root-1", node("ul", {}));
      renderer.commit(root, "root-1", {
        kind: "ul",
        attributes: {},
        slots: {},
        children: [
          node("li", { label: "old-1" }),
          node("li", { label: "old-2" }),
        ],
      });
      await Promise.resolve();
      const list = renderer.container.firstElementChild
        ?.firstElementChild as HTMLElement;
      expect(list.children.length).toBe(2);

      // The regression an adversarial review caught before implementation: the
      // prior array here is unkeyed, so a naive "only remove previously-keyed
      // elements" step would leak both stale <li> elements alongside the two
      // freshly built keyed ones.
      renderer.commit(
        root,
        "root-1",
        listOf([
          { key: "a", label: "Alice" },
          { key: "b", label: "Bob" },
        ]),
      );
      await Promise.resolve();

      const next = Array.from(list.children) as HTMLElement[];
      expect(next.map((el) => el.getAttribute("label"))).toEqual([
        "Alice",
        "Bob",
      ]);
      expect(list.children.length).toBe(2);
    });

    it("does not drop a row when two new children share the same key", async () => {
      const renderer = createSolidRenderer();
      const root = renderer.createRoot(
        "root-1",
        listOf([{ key: "a", label: "Alice" }]),
      );
      const list = renderer.container.firstElementChild
        ?.firstElementChild as HTMLElement;

      // A duplicate key within the NEW array is only reachable through the
      // unchecked `commit()` boundary (template-authoring rejects it). An
      // adversarial review caught that matching both duplicates to the same
      // old element made one DOM node occupy two `nextElements` slots,
      // silently dropping a row rather than merely leaving an unspecified
      // "which duplicate wins" outcome.
      renderer.commit(
        root,
        "root-1",
        listOf([
          { key: "a", label: "Alice" },
          { key: "a", label: "Alice-2" },
          { key: "b", label: "Bob" },
        ]),
      );
      await Promise.resolve();

      expect(list.children.length).toBe(3);
    });

    it("reconciles a keyed list nested as a non-root child", async () => {
      const wrap = (
        items: readonly { key: string; label: string }[],
      ): RenderNode => ({
        kind: "section",
        attributes: {},
        children: [listOf(items)],
        slots: {},
      });
      const renderer = createSolidRenderer();
      const root = renderer.createRoot(
        "root-1",
        wrap([
          { key: "a", label: "Alice" },
          { key: "b", label: "Bob" },
        ]),
      );
      const section = renderer.container.firstElementChild
        ?.firstElementChild as HTMLElement;
      const list = section.firstElementChild as HTMLElement;
      const [elA] = Array.from(list.children) as HTMLElement[];

      renderer.commit(
        root,
        "root-1",
        wrap([
          { key: "b", label: "Bob" },
          { key: "a", label: "Alice" },
        ]),
      );
      await Promise.resolve();

      const reordered = Array.from(list.children) as HTMLElement[];
      expect(reordered.map((el) => el.getAttribute("label"))).toEqual([
        "Bob",
        "Alice",
      ]);
      expect(reordered[1]).toBe(elA);
    });

    it("leaves an unkeyed list's positional reconciliation unaffected", async () => {
      const renderer = createSolidRenderer();
      const root = renderer.createRoot("root-1", {
        kind: "ul",
        attributes: {},
        slots: {},
        children: [
          node("li", { label: "Alice" }),
          node("li", { label: "Bob" }),
        ],
      });
      const list = renderer.container.firstElementChild
        ?.firstElementChild as HTMLElement;
      const [elA, elB] = Array.from(list.children) as HTMLElement[];

      renderer.commit(root, "root-1", {
        kind: "ul",
        attributes: {},
        slots: {},
        children: [
          node("li", { label: "Bob" }),
          node("li", { label: "Alice" }),
        ],
      });
      await Promise.resolve();

      // Positional reconciliation patches each existing element in place --
      // it does not move elA/elB to track the new label order.
      const next = Array.from(list.children) as HTMLElement[];
      expect(next[0]).toBe(elA);
      expect(next[1]).toBe(elB);
      expect(next.map((el) => el.getAttribute("label"))).toEqual([
        "Bob",
        "Alice",
      ]);
    });
  });

  describe("native nested views", () => {
    /** A native "dialog" view exposing a body element as a named anchor a
     * child projection can be mounted into. */
    const dialog: SolidView = (_props, context) => {
      const el = document.createElement("dialog");
      const body = document.createElement("div");
      body.setAttribute("data-role", "body");
      context.registerAnchor("body", body);
      el.appendChild(body);
      return el;
    };

    it("mounts a child projection into a registered anchor, isolated from the parent", () => {
      const renderer = createSolidRenderer({ views: { dialog } });
      const parentRoot = renderer.createRoot("parent-1", viewNode("dialog"));

      const childRoot = renderer.mountChild(
        parentRoot,
        "body",
        "child-1",
        node("section", { role: "child" }),
      );

      const body = renderer.container.querySelector('[data-role="body"]');
      const childSection = body?.querySelector("section");
      expect(childSection?.getAttribute("role")).toBe("child");
      expect(renderer.readIdentity(childRoot)).toBe("child-1");
      expect(renderer.readIdentity(parentRoot)).toBe("parent-1");

      // The child's own container carries its own identity attribute inside
      // the anchor, distinct from the parent's.
      const childContainer = body?.querySelector(
        `[${PROJECTION_IDENTITY_ATTRIBUTE}]`,
      );
      expect(childContainer?.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
        "child-1",
      );

      const parentDeliveries: JsonObject[] = [];
      const childDeliveries: JsonObject[] = [];
      renderer.registerInteraction(parentRoot, "click", (s) =>
        parentDeliveries.push(s),
      );
      renderer.registerInteraction(childRoot, "click", (s) =>
        childDeliveries.push(s),
      );
      childSection?.dispatchEvent(new Event("click", { bubbles: true }));
      // Only the child's own listener fires -- the containment guard stops
      // the bubbled event from also reaching the parent's listener, even
      // though the child's container is nested inside the parent's DOM.
      expect(childDeliveries).toHaveLength(1);
      expect(parentDeliveries).toHaveLength(0);
    });

    it("throws a clear error when the named anchor was never registered", () => {
      const renderer = createSolidRenderer({ views: { dialog } });
      const parentRoot = renderer.createRoot("parent-1", viewNode("dialog"));
      expect(() =>
        renderer.mountChild(
          parentRoot,
          "no-such-anchor",
          "child-1",
          node("section"),
        ),
      ).toThrow(/no anchor named/);
    });

    it("removing the child root leaves the parent view intact", () => {
      const renderer = createSolidRenderer({ views: { dialog } });
      const parentRoot = renderer.createRoot("parent-1", viewNode("dialog"));
      const childRoot = renderer.mountChild(
        parentRoot,
        "body",
        "child-1",
        node("section"),
      );
      renderer.removeRoot(childRoot);
      const body = renderer.container.querySelector('[data-role="body"]');
      expect(body?.querySelector("section")).toBeNull();
      expect(renderer.readIdentity(parentRoot)).toBe("parent-1");
    });

    it("reconciles a commit that replaces the anchor's element, preserving the mounted child", async () => {
      const renderer = createSolidRenderer({ views: { dialog } });
      const parentRoot = renderer.createRoot("parent-1", viewNode("dialog"));
      const childRoot = renderer.mountChild(
        parentRoot,
        "body",
        "child-1",
        node("section", { role: "child" }),
      );
      const childContainer = renderer.elementForIdentity("child-1");
      expect(childContainer).toBeDefined();

      const childDeliveries: JsonObject[] = [];
      renderer.registerInteraction(childRoot, "click", (s) =>
        childDeliveries.push(s),
      );

      // Any commit rebuilds the dialog view unconditionally (patchNode
      // always re-instantiates a view node), replacing its "body" anchor
      // element with a fresh one.
      renderer.commit(parentRoot, "parent-1", viewNode("dialog"));
      await Promise.resolve();

      // The child's own container element is the SAME reference as before --
      // no rebuild, no disposal -- just moved under the new body element.
      expect(renderer.elementForIdentity("child-1")).toBe(childContainer);
      const newBody = renderer.container.querySelector('[data-role="body"]');
      expect(newBody?.contains(childContainer!)).toBe(true);
      expect(renderer.readIdentity(childRoot)).toBe("child-1");

      // The interaction listener registered before the rebuild still fires.
      childContainer!
        .querySelector("section")
        ?.dispatchEvent(new Event("click", { bubbles: true }));
      expect(childDeliveries).toHaveLength(1);
    });

    it("releases a mounted child and reports the loss when its anchor stops being exposed", async () => {
      const renderer = createSolidRenderer({ views: { dialog } });
      const parentRoot = renderer.createRoot("parent-1", viewNode("dialog"));
      renderer.mountChild(parentRoot, "body", "child-1", node("section"));
      expect(renderer.elementForIdentity("child-1")).toBeDefined();

      const originalReportError = globalThis.reportError;
      const errors: unknown[] = [];
      (globalThis as { reportError?: (value: unknown) => void }).reportError = (
        error: unknown,
      ) => errors.push(error);
      try {
        // Swap the dialog out for a plain primitive with no "body" anchor at
        // all -- the child has nowhere left to live.
        renderer.commit(parentRoot, "parent-1", node("section"));
        await Promise.resolve();
      } finally {
        globalThis.reportError = originalReportError;
      }

      expect(renderer.elementForIdentity("child-1")).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toMatch(
        /anchor "body" was removed while it still hosted/,
      );
    });

    it("treats a stale anchor (the view stopped rendering it) as unregistered", async () => {
      const renderer = createSolidRenderer({ views: { dialog } });
      const parentRoot = renderer.createRoot("parent-1", viewNode("dialog"));
      // A later commit swaps the view out for a plain primitive with no
      // anchor -- the previously-registered "body" element is now detached
      // from the root's own container, even though the Map entry lingers.
      renderer.commit(parentRoot, "parent-1", node("section"));
      await Promise.resolve();
      expect(() =>
        renderer.mountChild(parentRoot, "body", "child-1", node("section")),
      ).toThrow(/no anchor named/);
    });
  });

  describe("single-slot anchor", () => {
    function nodeWithSlots(
      kind: string,
      slotNames: readonly string[],
      attributes: JsonObject = {},
    ): RenderNode {
      const slots: Record<string, { kind: "content"; content: null }> = {};
      for (const name of slotNames)
        slots[name] = { kind: "content", content: null };
      return { kind, attributes, children: [], slots };
    }

    it("a primitive node with exactly one resolved slot becomes its own anchor", () => {
      const renderer = createSolidRenderer();
      const parentRoot = renderer.createRoot(
        "parent-1",
        nodeWithSlots("div", ["body"]),
      );

      const childRoot = renderer.mountChild(
        parentRoot,
        "body",
        "child-1",
        node("section", { role: "child" }),
      );

      const div = renderer.container.querySelector("div");
      expect(div?.querySelector("section")?.getAttribute("role")).toBe("child");
      expect(renderer.readIdentity(childRoot)).toBe("child-1");
    });

    it("a node with zero or multiple resolved slots registers no anchor", () => {
      const renderer = createSolidRenderer();
      const zeroSlot = renderer.createRoot(
        "parent-1",
        nodeWithSlots("div", []),
      );
      expect(() =>
        renderer.mountChild(zeroSlot, "body", "child-1", node("section")),
      ).toThrow(/no anchor named/);

      const multiSlot = renderer.createRoot(
        "parent-2",
        nodeWithSlots("div", ["a", "b"]),
      );
      expect(() =>
        renderer.mountChild(multiSlot, "a", "child-2", node("section")),
      ).toThrow(/no anchor named/);
      expect(() =>
        renderer.mountChild(multiSlot, "b", "child-3", node("section")),
      ).toThrow(/no anchor named/);
    });

    it("a node that gains its sole slot on a patch-in-place commit becomes mountable", async () => {
      const renderer = createSolidRenderer();
      const parentRoot = renderer.createRoot(
        "parent-1",
        nodeWithSlots("div", []),
      );
      expect(() =>
        renderer.mountChild(parentRoot, "body", "child-1", node("section")),
      ).toThrow(/no anchor named/);

      // Same `kind` ("div") -- patched in place, not rebuilt.
      renderer.commit(parentRoot, "parent-1", nodeWithSlots("div", ["body"]));
      await Promise.resolve();

      expect(() =>
        renderer.mountChild(parentRoot, "body", "child-1", node("section")),
      ).not.toThrow();
    });

    it("a renamed sole slot on a patch-in-place commit un-registers the old name", async () => {
      const renderer = createSolidRenderer();
      const parentRoot = renderer.createRoot(
        "parent-1",
        nodeWithSlots("div", ["a"]),
      );

      renderer.commit(parentRoot, "parent-1", nodeWithSlots("div", ["b"]));
      await Promise.resolve();

      expect(() =>
        renderer.mountChild(parentRoot, "a", "child-1", node("section")),
      ).toThrow(/no anchor named/);
      expect(() =>
        renderer.mountChild(parentRoot, "b", "child-2", node("section")),
      ).not.toThrow();
    });

    it("a removed sole slot on a patch-in-place commit un-registers the anchor", async () => {
      const renderer = createSolidRenderer();
      const parentRoot = renderer.createRoot(
        "parent-1",
        nodeWithSlots("div", ["a"]),
      );

      renderer.commit(parentRoot, "parent-1", nodeWithSlots("div", []));
      await Promise.resolve();

      expect(() =>
        renderer.mountChild(parentRoot, "a", "child-1", node("section")),
      ).toThrow(/no anchor named/);
    });
  });
});
