import { describe, expect, it } from "vitest";

import { createFakeRenderer, type FakeRoot } from "../src/fake-renderer.js";
import type { RenderNode } from "../src/template-class.js";
import type { JsonObject } from "../src/strict-json.js";

function node(kind: string): RenderNode {
  return { kind, attributes: {}, children: [], slots: {} };
}

function only(renderer: ReturnType<typeof createFakeRenderer>): FakeRoot {
  const root = renderer.roots()[0];
  if (root === undefined) throw new Error("expected one root");
  return root;
}

describe("fake renderer interaction registration", () => {
  it("delivers a simulated interaction to the registered callback", () => {
    const renderer = createFakeRenderer();
    const adapterRoot = renderer.createRoot("root-1", node("section"));

    const received: JsonObject[] = [];
    renderer.registerInteraction(adapterRoot, "activate", (snapshot) => {
      received.push(snapshot);
    });

    renderer.simulateInteraction(only(renderer), "activate", { type: "click" });
    expect(received).toEqual([{ type: "click" }]);
  });

  it("delivers nothing for an unregistered type", () => {
    const renderer = createFakeRenderer();
    const adapterRoot = renderer.createRoot("root-1", node("section"));
    let calls = 0;
    renderer.registerInteraction(adapterRoot, "activate", () => {
      calls += 1;
    });
    renderer.simulateInteraction(only(renderer), "other", { type: "click" });
    expect(calls).toBe(0);
  });

  it("drops registrations when the root is removed", () => {
    const renderer = createFakeRenderer();
    const adapterRoot = renderer.createRoot("root-1", node("section"));
    let calls = 0;
    renderer.registerInteraction(adapterRoot, "activate", () => {
      calls += 1;
    });
    const fakeRoot = only(renderer);

    renderer.removeRoot(adapterRoot);
    renderer.simulateInteraction(fakeRoot, "activate", { type: "click" });
    expect(calls).toBe(0);
  });

  it("swallows a delivery-callback throw instead of propagating it", () => {
    const renderer = createFakeRenderer();
    const adapterRoot = renderer.createRoot("root-1", node("section"));
    let calls = 0;
    renderer.registerInteraction(adapterRoot, "activate", () => {
      calls += 1;
      throw new Error("delivery blew up");
    });

    // Mirrors real event dispatch: the throw must not escape the simulation, so
    // the failure contract is observable only through the failure channel.
    expect(() =>
      renderer.simulateInteraction(only(renderer), "activate", {
        type: "click",
      }),
    ).not.toThrow();
    expect(calls).toBe(1);
  });

  it("removes a single registration through its handle", () => {
    const renderer = createFakeRenderer();
    const adapterRoot = renderer.createRoot("root-1", node("section"));
    let calls = 0;
    const registration = renderer.registerInteraction(
      adapterRoot,
      "activate",
      () => {
        calls += 1;
      },
    );

    registration.remove();
    renderer.simulateInteraction(only(renderer), "activate", { type: "click" });
    expect(calls).toBe(0);
  });
});
