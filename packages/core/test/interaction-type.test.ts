import { describe, expect, it } from "vitest";

import { createComponentClass } from "../src/component-class.js";
import { createComponentRuntime } from "../src/component-runtime.js";
import { createEventClass, eventField } from "../src/event-class.js";
import { createEventRuntime } from "../src/event-runtime.js";
import { createFakeRenderer, type FakeRoot } from "../src/fake-renderer.js";
import {
  createInteractionBinding,
  DuplicateInteractionTypeError,
  InteractionTypeNotRegisteredError,
} from "../src/interaction-binding.js";
import {
  createInteractionType,
  isInteractionType,
} from "../src/interaction-type.js";
import { createProjectionRuntime } from "../src/projection-runtime.js";
import { type RootHandle } from "../src/renderer-port.js";
import { createRuntime } from "../src/runtime.js";
import { createTemplateClass } from "../src/template-class.js";
import { createTemplateRuntime } from "../src/template-runtime.js";
import { type JsonObject } from "../src/strict-json.js";

function harness(id = "app") {
  const runtime = createRuntime({ id });
  const components = createComponentRuntime(runtime);
  const templates = createTemplateRuntime(runtime);
  const renderer = createFakeRenderer();
  const projection = createProjectionRuntime(runtime, renderer);
  const dispatched: JsonObject[] = [];
  const events = createEventRuntime(runtime, {
    traceSink(record) {
      if (record.phase === "completed" && record.snapshot !== undefined) {
        dispatched.push(record.snapshot);
      }
    },
  });
  const activated = createEventClass("editor.activated", {
    at: eventField((value) => typeof value === "string"),
  });
  events.register(activated);
  const interactions = createInteractionBinding(runtime, projection, events);
  return {
    components,
    templates,
    renderer,
    projection,
    activated,
    interactions,
    dispatched,
  };
}

async function mountPanel(
  h: ReturnType<typeof harness>,
  slug = "editor.panel",
): Promise<{ root: RootHandle; fakeRoot: FakeRoot }> {
  const cls = createComponentClass(slug, () => ({}));
  const instance = await h.components.create(h.components.register(cls));
  h.templates.register(
    createTemplateClass(cls.localSlug, {
      component: cls.id,
      roots: { main: { kind: "section", attributes: {} } },
    }),
  );
  const projected = await h.projection.mount(
    instance,
    h.templates.resolvePlan(instance),
  );
  const root = projected.roots.main as RootHandle;
  const fakeRoot = h.renderer
    .roots()
    .find((candidate) => h.renderer.identityOf(candidate) === root.identity);
  if (fakeRoot === undefined) throw new Error("fake root missing");
  return { root, fakeRoot };
}

describe("interaction-type vocabulary", () => {
  it("gives an interaction identity distinct from the native name", () => {
    const type = createInteractionType("editor.activate", "click");
    expect(isInteractionType(type)).toBe(true);
    expect(type.native).toBe("click");
    expect(type.localSlug).toBe("editor.activate");
    // The identity is not the native name.
    expect(String(type.localSlug)).not.toBe(type.native);
    expect(isInteractionType("click")).toBe(false);
    expect(isInteractionType({ native: "click" })).toBe(false);
  });

  it("delivers through a registered InteractionType resolved to its native name", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    const activate = createInteractionType("editor.activate", "click");
    h.interactions.registerInteractionType(activate);
    h.interactions.bind(root, activate, h.activated, (snapshot) => ({
      at: typeof snapshot.type === "string" ? snapshot.type : "?",
    }));

    // The adapter fires the NATIVE event ("click"); the typed binding delivers.
    h.renderer.simulateInteraction(fakeRoot, "click", { type: "click" });
    await h.interactions.settled();
    expect(h.dispatched).toEqual([{ at: "click" }]);
  });

  it("rejects binding an unregistered InteractionType", async () => {
    const h = harness();
    const { root } = await mountPanel(h);
    const unregistered = createInteractionType("editor.activate", "click");
    expect(() =>
      h.interactions.bind(root, unregistered, h.activated, () => ({ at: "x" })),
    ).toThrow(InteractionTypeNotRegisteredError);
  });

  it("rejects a duplicate local slug registration", () => {
    const h = harness();
    h.interactions.registerInteractionType(
      createInteractionType("editor.activate", "click"),
    );
    expect(() =>
      h.interactions.registerInteractionType(
        createInteractionType("editor.activate", "pointerdown"),
      ),
    ).toThrow(DuplicateInteractionTypeError);
  });

  it("still accepts a raw string without registration", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "click", h.activated, (snapshot) => ({
      at: typeof snapshot.type === "string" ? snapshot.type : "?",
    }));
    h.renderer.simulateInteraction(fakeRoot, "click", { type: "click" });
    await h.interactions.settled();
    expect(h.dispatched).toEqual([{ at: "click" }]);
  });
});
