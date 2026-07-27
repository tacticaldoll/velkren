// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { h, inject } from "vue";

import {
  PROJECTION_IDENTITY_ATTRIBUTE,
  type JsonObject,
  type RenderNode,
} from "@velkren/core";

import {
  createVueRenderer,
  REGISTER_ANCHOR_KEY,
  type VueView,
} from "../src/index.js";

function node(
  kind: string,
  attributes: JsonObject = {},
  children: RenderNode[] = [],
): RenderNode {
  return { kind, attributes, children, slots: {} };
}

describe("vue renderer", () => {
  it("renders a registered view with the node's attributes as props", () => {
    const badge: VueView = (props) =>
      h("span", {
        "data-badge": typeof props.label === "string" ? props.label : "",
      });
    const renderer = createVueRenderer({ views: { badge } });
    const root = renderer.createRoot("id-view", node("badge", { label: "hi" }));

    const container = renderer.elementForIdentity("id-view");
    expect(
      container?.querySelector("[data-badge]")?.getAttribute("data-badge"),
    ).toBe("hi");
    renderer.removeRoot(root);
  });

  it("delivers a plain (non-nested) interaction to its own root's listener", () => {
    const renderer = createVueRenderer();
    const root = renderer.createRoot("id-plain", node("button"));
    const container = renderer.elementForIdentity("id-plain");
    const button = container?.querySelector("button");

    const deliveries: JsonObject[] = [];
    renderer.registerInteraction(root, "click", (s) => deliveries.push(s));
    button?.dispatchEvent(new Event("click", { bubbles: true }));

    expect(deliveries).toHaveLength(1);
    renderer.removeRoot(root);
  });

  it("repairs a removed identity attribute on commit", () => {
    const renderer = createVueRenderer();
    const root = renderer.createRoot("id-repair", node("section"));
    const container = renderer.elementForIdentity("id-repair");

    container?.removeAttribute(PROJECTION_IDENTITY_ATTRIBUTE);
    renderer.commit(root, "id-repair", node("section", { v: "2" }));
    expect(container?.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe(
      "id-repair",
    );
    renderer.removeRoot(root);
  });

  it("falls back to the primitive path for an unregistered kind", () => {
    const renderer = createVueRenderer();
    const root = renderer.createRoot("id-prim", node("section", { v: "1" }));
    const container = renderer.elementForIdentity("id-prim");
    const section = container?.querySelector("section");
    expect(section?.getAttribute("v")).toBe("1");
    renderer.removeRoot(root);
  });

  it("does not overwrite a user-typed value once the field is dirty (no adapter code needed)", () => {
    const renderer = createVueRenderer();
    const root = renderer.createRoot("id-value", node("input", { value: "a" }));
    const input = renderer
      .elementForIdentity("id-value")
      ?.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("a");

    // The user types, setting the HTML "dirty value flag."
    input.value = "typed by user";
    // A same-value re-commit (the common echo-back case) must not disturb it.
    // This is Vue's own render()/patchDOMProp behavior -- no adapter code
    // handles `value` specially anywhere in this package.
    renderer.commit(
      root,
      "id-value",
      node("input", { value: "typed by user" }),
    );
    expect(input.value).toBe("typed by user");

    // A genuinely different, state-driven value still reaches the property.
    renderer.commit(root, "id-value", node("input", { value: "external" }));
    expect(input.value).toBe("external");
    renderer.removeRoot(root);
  });

  it("skips a redundant assignment and preserves the caret on a same-value re-commit", () => {
    const renderer = createVueRenderer();
    const root = renderer.createRoot(
      "id-caret",
      node("input", { value: "hello" }),
    );
    const input = renderer
      .elementForIdentity("id-caret")
      ?.querySelector("input") as HTMLInputElement;
    input.setSelectionRange(2, 2);

    renderer.commit(root, "id-caret", node("input", { value: "hello" }));

    expect(input.value).toBe("hello");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
    renderer.removeRoot(root);
  });

  describe("native nested views", () => {
    /** A native "dialog" view exposing a body element as a named anchor a
     * child projection can be mounted into, via provide/inject (not a prop
     * -- VueView's prop type is unaffected by this feature). */
    const Dialog: VueView = () => {
      const registerAnchor = inject(REGISTER_ANCHOR_KEY);
      return h("dialog", null, [
        h("div", {
          "data-role": "body",
          ref: (element: Element | null) => {
            if (element instanceof HTMLElement) {
              registerAnchor?.("body", element);
            }
          },
        }),
      ]);
    };

    it("mounts a child projection into a registered anchor, isolated from the parent", () => {
      const renderer = createVueRenderer({ views: { dialog: Dialog } });
      const parentRoot = renderer.createRoot("parent-1", node("dialog"));

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
      // though the child is an independent Vue render root nested inside
      // the parent's DOM.
      expect(childDeliveries).toHaveLength(1);
      expect(parentDeliveries).toHaveLength(0);

      renderer.removeRoot(childRoot);
      renderer.removeRoot(parentRoot);
    });

    it("throws a clear error when the named anchor was never registered", () => {
      const renderer = createVueRenderer({ views: { dialog: Dialog } });
      const parentRoot = renderer.createRoot("parent-1", node("dialog"));
      expect(() =>
        renderer.mountChild(
          parentRoot,
          "no-such-anchor",
          "child-1",
          node("section"),
        ),
      ).toThrow(/no anchor named/);
      renderer.removeRoot(parentRoot);
    });

    it("removing the child root leaves the parent view intact", () => {
      const renderer = createVueRenderer({ views: { dialog: Dialog } });
      const parentRoot = renderer.createRoot("parent-1", node("dialog"));
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
      renderer.removeRoot(parentRoot);
    });
  });
});
