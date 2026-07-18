// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  createEventClass,
  createEventRuntime,
  createRuntime,
  eventField,
  PROJECTION_IDENTITY_ATTRIBUTE,
  type JsonObject,
  type RenderNode,
} from "@velkren/core";
import { createSolidRenderer, snapshotNativeEvent } from "../src/index.js";

function node(kind: string, attributes: JsonObject = {}): RenderNode {
  return { kind, attributes, children: [], slots: {} };
}

describe("SolidJS renderer port", () => {
  it("mounts a plan to the DOM with its identity attribute", () => {
    const renderer = createSolidRenderer();
    renderer.createRoot("root-1", node("section", { role: "main" }));
    const element = renderer.container.firstElementChild as HTMLElement;
    expect(element.tagName.toLowerCase()).toBe("section");
    expect(element.getAttribute("role")).toBe("main");
    expect(element.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe("root-1");
  });

  it("reactively updates content on commit", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("div", { state: "a" }));
    const element = renderer.container.firstElementChild as HTMLElement;
    renderer.commit(root, "root-1", node("div", { state: "b" }));
    await Promise.resolve();
    expect(element.getAttribute("state")).toBe("b");
  });

  it("repairs a removed identity attribute on commit", async () => {
    const renderer = createSolidRenderer();
    const root = renderer.createRoot("root-1", node("div"));
    const element = renderer.container.firstElementChild as HTMLElement;
    element.removeAttribute(PROJECTION_IDENTITY_ATTRIBUTE);
    renderer.commit(root, "root-1", node("div", { state: "x" }));
    await Promise.resolve();
    expect(element.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE)).toBe("root-1");
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
    const element = renderer.container.firstElementChild as HTMLInputElement;

    let pending: Promise<unknown> | undefined;
    renderer.registerInteraction(root, "input", (snapshot) => {
      pending = events.dispatch(changed.id, {
        value: typeof snapshot.value === "string" ? snapshot.value : "",
      });
    });

    element.value = "hello";
    element.dispatchEvent(new Event("input"));
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
    const element = renderer.container.firstElementChild as HTMLInputElement;

    let kept = 0;
    let removed = 0;
    renderer.registerInteraction(root, "input", () => {
      kept += 1;
    });
    const registration = renderer.registerInteraction(root, "input", () => {
      removed += 1;
    });

    element.dispatchEvent(new Event("input"));
    expect([kept, removed]).toEqual([1, 1]);

    registration.remove();
    element.dispatchEvent(new Event("input"));
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
    const element = renderer.container.firstElementChild as HTMLInputElement;

    // react
    renderer.commit(root, "root-1", node("input", { state: "b" }));
    await Promise.resolve();
    expect(element.getAttribute("state")).toBe("b");

    // emit
    let emissions = 0;
    renderer.registerInteraction(root, "input", (snapshot) => {
      emissions += 1;
      void events.dispatch(changed.id, {
        value: typeof snapshot.value === "string" ? snapshot.value : "",
      });
    });
    element.value = "one";
    element.dispatchEvent(new Event("input"));
    expect(emissions).toBe(1);

    // unmount
    renderer.removeRoot(root);
    expect(renderer.container.children.length).toBe(0);
    expect(renderer.elementForIdentity("root-1")).toBeUndefined();

    // no listener remains and no reactive effect runs after disposal
    element.dispatchEvent(new Event("input"));
    expect(emissions).toBe(1);
    // simulate on the removed identity is a no-op
    renderer.simulateInteraction("root-1", "input");
    expect(emissions).toBe(1);
    renderer.commit(root, "root-1", node("input", { state: "c" }));
    await Promise.resolve();
    expect(element.getAttribute("state")).toBe("b");
  });
});
