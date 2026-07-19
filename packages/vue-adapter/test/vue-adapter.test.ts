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
});
