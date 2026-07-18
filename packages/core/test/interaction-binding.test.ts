import { describe, expect, it } from "vitest";

import { createComponentClass } from "../src/component-class.js";
import { createComponentRuntime } from "../src/component-runtime.js";
import { createEventClass, eventField } from "../src/event-class.js";
import { createEventRuntime } from "../src/event-runtime.js";
import { createFakeRenderer, type FakeRoot } from "../src/fake-renderer.js";
import {
  createInteractionBinding,
  DuplicateInteractionBindingError,
  DuplicateInteractionRuntimeError,
  ForeignRootBindingError,
  InvalidInteractionPayloadError,
  NonObjectSnapshotError,
} from "../src/interaction-binding.js";
import { createProjectionRuntime } from "../src/projection-runtime.js";
import {
  type InteractionRegistration,
  type RootHandle,
} from "../src/renderer-port.js";
import type { RendererPort } from "../src/renderer-port.js";
import { OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";
import type { JsonObject } from "../src/strict-json.js";
import { createTemplateClass } from "../src/template-class.js";
import { createTemplateRuntime } from "../src/template-runtime.js";
import * as publicApi from "../src/index.js";

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
    runtime,
    components,
    templates,
    renderer,
    projection,
    events,
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

describe("interaction-to-event binding", () => {
  it("dispatches the bound event with the projected payload", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, (snapshot) => ({
      at: typeof snapshot.type === "string" ? snapshot.type : "?",
    }));

    h.renderer.simulateInteraction(fakeRoot, "activate", {
      type: "click",
      value: null,
    });
    await h.interactions.settled();

    expect(h.dispatched).toEqual([{ at: "click" }]);
  });

  it("freezes the snapshot before the projection observes it", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    let observed: JsonObject | undefined;
    h.interactions.bind(root, "activate", h.activated, (snapshot) => {
      observed = snapshot;
      return { at: "x" };
    });

    h.renderer.simulateInteraction(fakeRoot, "activate", {
      type: "click",
      value: null,
    });
    await h.interactions.settled();

    expect(observed).toBeDefined();
    expect(Object.isFrozen(observed)).toBe(true);
  });

  it("enforces a single interaction-binding domain per runtime", () => {
    const h = harness();
    expect(() =>
      createInteractionBinding(h.runtime, h.projection, h.events),
    ).toThrow(DuplicateInteractionRuntimeError);
  });
});

describe("binding ownership and duplication", () => {
  it("rejects a foreign-runtime root before any port registration", async () => {
    const first = harness("first");
    const second = harness("second");
    const { root: foreignRoot } = await mountPanel(second);
    expect(() =>
      first.interactions.bind(foreignRoot, "activate", first.activated, () => ({
        at: "x",
      })),
    ).toThrow(ForeignRootBindingError);
    // A ForeignRootBindingError is still an ownership error.
    expect(() =>
      first.interactions.bind(foreignRoot, "activate", first.activated, () => ({
        at: "x",
      })),
    ).toThrow(OwnershipError);
  });

  it("rejects a duplicate active (root, type) with no second registration", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: "one" }));
    expect(() =>
      h.interactions.bind(root, "activate", h.activated, () => ({ at: "two" })),
    ).toThrow(DuplicateInteractionBindingError);

    h.renderer.simulateInteraction(fakeRoot, "activate", { type: "click" });
    await h.interactions.settled();
    // Exactly one registration fired; the rejected second bind added nothing.
    expect(h.dispatched).toEqual([{ at: "one" }]);
  });
});

describe("snapshot and payload boundary", () => {
  it("rejects a non-object snapshot at the boundary with no dispatch", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: "x" }));

    expect(() =>
      h.renderer.simulateInteraction(
        fakeRoot,
        "activate",
        42 as unknown as JsonObject,
      ),
    ).toThrow(NonObjectSnapshotError);
    expect(() =>
      h.renderer.simulateInteraction(
        fakeRoot,
        "activate",
        [] as unknown as JsonObject,
      ),
    ).toThrow(NonObjectSnapshotError);

    await h.interactions.settled();
    expect(h.dispatched).toEqual([]);
  });

  it("rejects a plain object hiding a nested non-JSON reference with no dispatch", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: "x" }));

    // A live reference smuggled inside an otherwise plain object must not cross
    // the boundary — this is the exact leak the snapshot boundary exists to stop.
    expect(() =>
      h.renderer.simulateInteraction(fakeRoot, "activate", {
        handler: () => undefined,
      } as unknown as JsonObject),
    ).toThrow(NonObjectSnapshotError);
    expect(() =>
      h.renderer.simulateInteraction(fakeRoot, "activate", {
        node: new (class LiveNode {})(),
      } as unknown as JsonObject),
    ).toThrow(NonObjectSnapshotError);

    await h.interactions.settled();
    expect(h.dispatched).toEqual([]);
  });

  it("deeply freezes nested snapshot content before the projection observes it", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    let observed: JsonObject | undefined;
    h.interactions.bind(root, "activate", h.activated, (snapshot) => {
      observed = snapshot;
      return { at: "x" };
    });

    h.renderer.simulateInteraction(fakeRoot, "activate", {
      meta: { key: "value" },
      list: [1, 2],
    });
    await h.interactions.settled();

    expect(observed).toBeDefined();
    const snap = observed as JsonObject;
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.meta)).toBe(true);
    expect(Object.isFrozen(snap.list)).toBe(true);
  });

  it("rejects a payload the EventClass schema rejects with no partial event", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: 123 }));

    expect(() =>
      h.renderer.simulateInteraction(fakeRoot, "activate", { type: "click" }),
    ).toThrow(InvalidInteractionPayloadError);

    await h.interactions.settled();
    expect(h.dispatched).toEqual([]);
  });
});

describe("managed binding lifecycle", () => {
  it("release removes the port registration and stops delivery", async () => {
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: "x" }));

    await root.release();
    expect(fakeRoot.removed).toBe(true);

    h.renderer.simulateInteraction(fakeRoot, "activate", { type: "click" });
    await h.interactions.settled();
    expect(h.dispatched).toEqual([]);
  });

  it("re-checks liveness so a delivery racing release dispatches nothing", async () => {
    // A capturing port whose removeRoot keeps the delivery callback callable,
    // isolating the binding's own liveness re-check from port removal.
    const runtime = createRuntime({ id: "race" });
    const components = createComponentRuntime(runtime);
    const templates = createTemplateRuntime(runtime);
    let captured: ((snapshot: JsonObject) => void) | undefined;
    const port: RendererPort = {
      createRoot: (identity) => ({ identity }),
      commit: () => undefined,
      readIdentity: (root) => (root as { identity: string }).identity,
      removeRoot: () => undefined,
      registerInteraction: (_root, _type, deliver): InteractionRegistration => {
        captured = deliver;
        return { remove: () => undefined };
      },
    };
    const projection = createProjectionRuntime(runtime, port);
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

    const cls = createComponentClass("editor.panel", () => ({}));
    const instance = await components.create(components.register(cls));
    templates.register(
      createTemplateClass(cls.localSlug, {
        component: cls.id,
        roots: { main: { kind: "section", attributes: {} } },
      }),
    );
    const projected = await projection.mount(
      instance,
      templates.resolvePlan(instance),
    );
    const root = projected.roots.main as RootHandle;
    interactions.bind(root, "activate", activated, () => ({ at: "x" }));

    // Begin release without awaiting: the root is now disposing.
    const releasing = root.release();
    // The adapter reports an interaction that was already in flight.
    captured?.({ type: "click" });
    await releasing;
    await interactions.settled();

    expect(dispatched).toEqual([]);
  });

  it("registers a binding against a freshly projected root after release", async () => {
    const h = harness();
    const first = await mountPanel(h, "editor.panel.one");
    h.interactions.bind(first.root, "activate", h.activated, () => ({
      at: "first",
    }));
    await first.root.release();

    const second = await mountPanel(h, "editor.panel.two");
    h.interactions.bind(second.root, "activate", h.activated, () => ({
      at: "second",
    }));

    h.renderer.simulateInteraction(second.fakeRoot, "activate", {
      type: "click",
    });
    await h.interactions.settled();
    expect(h.dispatched).toEqual([{ at: "second" }]);
  });
});

describe("framework-neutral input core", () => {
  it("runs binding, delivery, and release in Node with no DOM", async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe(
      "undefined",
    );
    const h = harness();
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: "node" }));
    h.renderer.simulateInteraction(fakeRoot, "activate", { type: "click" });
    await h.interactions.settled();
    await root.release();
    expect(h.dispatched).toEqual([{ at: "node" }]);
  });

  it("exposes the binding surface without binding internals or kernels", () => {
    const names = new Set(Object.keys(publicApi));
    expect(names.has("createInteractionBinding")).toBe(true);
    expect(names.has("ForeignRootBindingError")).toBe(true);
    expect(names.has("NonObjectSnapshotError")).toBe(true);
    expect(names.has("InvalidInteractionPayloadError")).toBe(true);
    expect(names.has("DuplicateInteractionBindingError")).toBe(true);
    // Internals stay unexported.
    expect(names.has("projectionInteractionAccessor")).toBe(false);
    expect(names.has("DefaultInteractionBinding")).toBe(false);
  });
});
