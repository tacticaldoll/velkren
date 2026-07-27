// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { h } from "vue";

import {
  PROJECTION_IDENTITY_ATTRIBUTE,
  type JsonObject,
  type RenderNode,
} from "@velkren/core";

import { createVueRenderer, type VueView } from "../src/index.js";

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
});
