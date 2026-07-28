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

import { createElement, useContext } from "react";

import {
  createReactRenderer,
  RegisterAnchorContext,
  snapshotNativeEvent,
  type ReactRenderer,
  type ReactView,
  type ReactViewRegistry,
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

  it("does not overwrite a user-typed value once the field is dirty", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot("root-1", node("input", { value: "a" }));
    const input = renderer.elementForIdentity("root-1")
      ?.firstElementChild as HTMLInputElement;
    expect(input.value).toBe("a");

    // The user types, setting the HTML "dirty value flag."
    input.value = "typed by user";
    // A same-value re-commit (the common echo-back case) must not disturb it,
    // and React must never resync the DOM back to a stale prop value: `value`
    // never reaches React's props for this node in the first place.
    renderer.commit(root, "root-1", node("input", { value: "typed by user" }));
    expect(input.value).toBe("typed by user");

    // A genuinely different, state-driven value still reaches the property.
    renderer.commit(root, "root-1", node("input", { value: "external" }));
    expect(input.value).toBe("external");
  });

  it("skips a redundant assignment and preserves the caret on a same-value re-commit", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot(
      "root-1",
      node("input", { value: "hello" }),
    );
    const input = renderer.elementForIdentity("root-1")
      ?.firstElementChild as HTMLInputElement;
    input.setSelectionRange(2, 2);

    renderer.commit(root, "root-1", node("input", { value: "hello" }));

    expect(input.value).toBe("hello");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it("restores the selection range (clamped to the new length) across a real value change", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot(
      "root-1",
      node("input", { value: "hello" }),
    );
    const input = renderer.elementForIdentity("root-1")
      ?.firstElementChild as HTMLInputElement;
    input.setSelectionRange(3, 5);

    renderer.commit(root, "root-1", node("input", { value: "hi" }));

    expect(input.value).toBe("hi");
    expect(input.selectionStart).toBe(2); // clamped to the new length
    expect(input.selectionEnd).toBe(2);
  });

  it("applies a value crossing without throwing on an input type that rejects selection", () => {
    const renderer = createReactRenderer();
    const root = renderer.createRoot(
      "root-1",
      node("input", { type: "number", value: "1" }),
    );
    const input = renderer.elementForIdentity("root-1")
      ?.firstElementChild as HTMLInputElement;
    expect(input.value).toBe("1");

    expect(() => {
      renderer.commit(
        root,
        "root-1",
        node("input", { type: "number", value: "2" }),
      );
    }).not.toThrow();
    expect(input.value).toBe("2");
  });

  it("leaves a non-form element's value attribute as an ordinary React prop", () => {
    const renderer = createReactRenderer();
    renderer.createRoot("root-1", node("li", { value: "3" }));
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    // <li value> is a real HTML attribute (ordinal value), not a form
    // control's controlled-value prop -- React (and this adapter) treat it as
    // an ordinary attribute, unaffected by the input/textarea/select crossing.
    expect(content?.getAttribute("value")).toBe("3");
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
    renderer.createRoot("root-1", viewNode("badge", { label: "hi" }));
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    // The registered view rendered (a <span>), not a primitive <badge>, and it
    // received the node's props as props (label read into title + text).
    expect(content?.tagName.toLowerCase()).toBe("span");
    expect(content?.getAttribute("title")).toBe("hi");
    expect(content?.textContent).toBe("hi");
  });

  it("throws a clear error for an unregistered viewId", () => {
    const renderer = createReactRenderer({ views: { badge: Badge } });
    expect(() =>
      renderer.createRoot("root-1", viewNode("no-such-view")),
    ).toThrow(/no view registered for viewId/);
    // The throw happens inside React's render phase (unlike the anchor-miss
    // error below, which is a plain function call outside any render), so
    // React's own dev-mode diagnostic about the render error is expected
    // ancillary noise here, not a real console-error regression.
    consoleErrors.length = 0;
  });

  it("a primitive node whose kind coincidentally matches a registry key still renders as a primitive", () => {
    // "ui-badge" is a registered viewId here, but this node is a primitive
    // (carrying `kind`, not `node: "view"`), so the registry is never
    // consulted for it. A hyphenated tag also avoids React's
    // unrecognized-tag warning (a hard failure in this suite).
    const renderer = createReactRenderer({ views: { "ui-badge": Badge } });
    renderer.createRoot("root-1", node("ui-badge", { label: "hi" }));
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    expect(content?.tagName.toLowerCase()).toBe("ui-badge");
    expect(content?.getAttribute("label")).toBe("hi");
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

  it("renders a registered view as a leaf (a view node has no children of its own)", () => {
    const Leaf: ReactView = (props) =>
      createElement(
        "span",
        null,
        typeof props.label === "string" ? props.label : "",
      );
    const renderer = createReactRenderer({ views: { leaf: Leaf } });
    renderer.createRoot("root-1", viewNode("leaf", { label: "solo" }));
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    expect(content?.tagName.toLowerCase()).toBe("span");
    expect(content?.textContent).toBe("solo");
    expect(content?.children.length).toBe(0);
  });

  it("rebuilds rather than patches across a primitive<->view variant change on commit", () => {
    const renderer = createReactRenderer({ views: { badge: Badge } });
    const root = renderer.createRoot("root-1", node("span", { label: "a" }));
    renderer.commit(root, "root-1", viewNode("badge", { label: "b" }));
    const content = renderer.elementForIdentity("root-1")?.firstElementChild;
    expect(content?.tagName.toLowerCase()).toBe("span");
    expect(content?.getAttribute("title")).toBe("b");
    renderer.commit(root, "root-1", node("ui-em", { label: "c" }));
    const back = renderer.elementForIdentity("root-1")?.firstElementChild;
    expect(back?.tagName.toLowerCase()).toBe("ui-em");
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
      templateRoot: {
        node: "view",
        viewId: "ui.button",
        props: { label: "go" },
      },
    });
    const container = bound.renderer.elementForIdentity(bound.root.identity);
    // The registered view renders at the ROOT (a <button>, not a <ui.button>).
    expect(container?.firstElementChild?.tagName.toLowerCase()).toBe("button");
    expect(container?.firstElementChild?.getAttribute("title")).toBe("go");

    // It updates on a subsequent commit (fresh props via React re-render).
    bound.commit(viewNode("ui.button", { label: "stop" }));
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

    it("preserves each key's DOM element identity across a reorder", () => {
      const renderer = createReactRenderer();
      const root = renderer.createRoot(
        "root-1",
        listOf([
          { key: "a", label: "Alice" },
          { key: "b", label: "Bob" },
          { key: "c", label: "Carol" },
        ]),
      );
      const list = renderer.elementForIdentity("root-1")
        ?.firstElementChild as HTMLElement;
      const [elA, elB, elC] = Array.from(list.children) as HTMLElement[];
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

    it("leaves an unkeyed list's reconciliation unaffected", () => {
      const renderer = createReactRenderer();
      const root = renderer.createRoot("root-1", {
        kind: "ul",
        attributes: {},
        slots: {},
        children: [
          node("li", { label: "Alice" }),
          node("li", { label: "Bob" }),
        ],
      });
      const list = renderer.elementForIdentity("root-1")
        ?.firstElementChild as HTMLElement;
      const before = Array.from(list.children).map((el) =>
        el.getAttribute("label"),
      );
      expect(before).toEqual(["Alice", "Bob"]);

      renderer.commit(root, "root-1", {
        kind: "ul",
        attributes: {},
        slots: {},
        children: [
          node("li", { label: "Bob" }),
          node("li", { label: "Alice" }),
        ],
      });
      const after = Array.from(list.children).map((el) =>
        el.getAttribute("label"),
      );
      expect(after).toEqual(["Bob", "Alice"]);
    });

    it("renders every child of a partially-keyed list (reachable only via a direct commit)", () => {
      // Template-authoring rejects a mixed keyed/unkeyed children array; a
      // raw commit does not. Every child must still render -- an explicit
      // key must not collide with a synthesized positional key for an
      // unkeyed sibling.
      const renderer = createReactRenderer();
      renderer.createRoot("root-1", {
        kind: "ul",
        attributes: {},
        slots: {},
        children: [
          {
            kind: "li",
            attributes: { label: "keyed" },
            children: [],
            slots: {},
            key: "1",
          },
          {
            kind: "li",
            attributes: { label: "unkeyed" },
            children: [],
            slots: {},
          },
        ],
      });
      const list = renderer.elementForIdentity("root-1")
        ?.firstElementChild as HTMLElement;
      expect(
        Array.from(list.children).map((el) => el.getAttribute("label")),
      ).toEqual(["keyed", "unkeyed"]);
    });
  });

  describe("native nested views", () => {
    /** A native "dialog" view exposing a body element as a named anchor a
     * child projection can be mounted into, via RegisterAnchorContext (not
     * a prop -- ReactView's prop type is unaffected by this feature). */
    const Dialog: ReactView = () => {
      const registerAnchor = useContext(RegisterAnchorContext);
      return createElement("dialog", null, [
        createElement("div", {
          key: "body",
          "data-role": "body",
          ref: (element: HTMLDivElement | null) => {
            if (element !== null) registerAnchor?.("body", element);
          },
        }),
      ]);
    };

    it("mounts a child projection into a registered anchor, isolated from the parent", () => {
      const renderer = createReactRenderer({ views: { dialog: Dialog } });
      const parentRoot = renderer.createRoot("parent-1", viewNode("dialog"));

      const childRoot = renderer.mountChild(
        parentRoot,
        "body",
        "child-1",
        node("section", { role: "child" }),
      );

      const container = renderer.elementForIdentity("parent-1");
      const body = container?.querySelector('[data-role="body"]');
      const childSection = body?.querySelector("section");
      expect(childSection?.getAttribute("role")).toBe("child");
      expect(renderer.readIdentity(childRoot)).toBe("child-1");
      expect(renderer.readIdentity(parentRoot)).toBe("parent-1");

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
      // though the child is an independent React root nested inside the
      // parent's DOM.
      expect(childDeliveries).toHaveLength(1);
      expect(parentDeliveries).toHaveLength(0);
    });

    it("throws a clear error when the named anchor was never registered", () => {
      const renderer = createReactRenderer({ views: { dialog: Dialog } });
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
      const renderer = createReactRenderer({ views: { dialog: Dialog } });
      const parentRoot = renderer.createRoot("parent-1", viewNode("dialog"));
      const childRoot = renderer.mountChild(
        parentRoot,
        "body",
        "child-1",
        node("section"),
      );
      renderer.removeRoot(childRoot);
      const container = renderer.elementForIdentity("parent-1");
      const body = container?.querySelector('[data-role="body"]');
      expect(body?.querySelector("section")).toBeNull();
      expect(renderer.readIdentity(parentRoot)).toBe("parent-1");
    });
  });
});
