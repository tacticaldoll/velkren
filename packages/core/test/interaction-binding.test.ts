import { afterEach, describe, expect, it, vi } from "vitest";

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
  type InteractionFailure,
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
import { EventDispatchError } from "../src/event-dispatch.js";

// `console` is not declared in the core ES2022 test lib; reach the host console
// through globalThis (mirroring the binding's reporter of last resort) so spies
// target the exact object the implementation reports through.
const hostConsole = (globalThis as { console: { error(value: unknown): void } })
  .console;

interface HarnessOptions {
  /** When true, register an `onFailure` observer collecting into `failures`. */
  readonly observeFailures?: boolean;
}

function harness(id = "app", options: HarnessOptions = {}) {
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
  const failures: InteractionFailure[] = [];
  const interactions = createInteractionBinding(
    runtime,
    projection,
    events,
    options.observeFailures === true
      ? { onFailure: (failure) => failures.push(failure) }
      : {},
  );
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
    failures,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
  it("surfaces a non-object primitive/array snapshot as one typed failure with no dispatch", async () => {
    const h = harness("app", { observeFailures: true });
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: "x" }));

    // The fake now swallows the delivery throw, so the failure is observed only
    // through the owned channel — never by a propagated throw.
    h.renderer.simulateInteraction(
      fakeRoot,
      "activate",
      42 as unknown as JsonObject,
    );
    h.renderer.simulateInteraction(
      fakeRoot,
      "activate",
      [] as unknown as JsonObject,
    );
    await h.interactions.settled();

    expect(h.failures).toHaveLength(2);
    for (const failure of h.failures) {
      expect(failure.reason).toBe("non-object-snapshot");
      expect(failure.type).toBe("activate");
      expect(failure.root).toBe(root);
      expect(failure.cause).toBeInstanceOf(NonObjectSnapshotError);
    }
    expect(h.dispatched).toEqual([]);
  });

  it("surfaces a nested non-JSON reference as one non-object-snapshot failure with no dispatch", async () => {
    const h = harness("app", { observeFailures: true });
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: "x" }));

    // A live reference smuggled inside an otherwise plain object must not cross
    // the boundary — the distinct createJsonSnapshot sub-path of the same reason.
    h.renderer.simulateInteraction(fakeRoot, "activate", {
      handler: () => undefined,
    } as unknown as JsonObject);
    h.renderer.simulateInteraction(fakeRoot, "activate", {
      node: new (class LiveNode {})(),
    } as unknown as JsonObject);
    await h.interactions.settled();

    expect(h.failures).toHaveLength(2);
    for (const failure of h.failures) {
      expect(failure.reason).toBe("non-object-snapshot");
      expect(failure.cause).toBeInstanceOf(NonObjectSnapshotError);
    }
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

  it("surfaces a schema-invalid payload as one invalid-payload failure with no partial event", async () => {
    const h = harness("app", { observeFailures: true });
    const { root, fakeRoot } = await mountPanel(h);
    h.interactions.bind(root, "activate", h.activated, () => ({ at: 123 }));

    h.renderer.simulateInteraction(fakeRoot, "activate", { type: "click" });
    await h.interactions.settled();

    expect(h.failures).toHaveLength(1);
    expect(h.failures[0]?.reason).toBe("invalid-payload");
    expect(h.failures[0]?.cause).toBeInstanceOf(InvalidInteractionPayloadError);
    expect(h.dispatched).toEqual([]);
  });

  it("surfaces a throwing projection as one projection-error failure with no dispatch", async () => {
    const h = harness("app", { observeFailures: true });
    const { root, fakeRoot } = await mountPanel(h);
    const boom = new Error("projection blew up");
    h.interactions.bind(root, "activate", h.activated, () => {
      throw boom;
    });

    h.renderer.simulateInteraction(fakeRoot, "activate", { type: "click" });
    await h.interactions.settled();

    expect(h.failures).toHaveLength(1);
    expect(h.failures[0]?.reason).toBe("projection-error");
    expect(h.failures[0]?.cause).toBe(boom);
    expect(h.dispatched).toEqual([]);
  });

  it("surfaces a rejected dispatch as one dispatch-error failure with no dispatch", async () => {
    const h = harness("app", { observeFailures: true });
    const { root, fakeRoot } = await mountPanel(h);
    // A valid EventClass never registered with the event runtime: the payload
    // passes the class's own schema, but dispatch rejects on resolution.
    const unregistered = createEventClass("editor.unregistered", {
      at: eventField((value) => typeof value === "string"),
    });
    h.interactions.bind(root, "activate", unregistered, () => ({ at: "x" }));

    h.renderer.simulateInteraction(fakeRoot, "activate", { type: "click" });
    await h.interactions.settled();

    expect(h.failures).toHaveLength(1);
    expect(h.failures[0]?.reason).toBe("dispatch-error");
    expect(h.failures[0]?.cause).toBeInstanceOf(EventDispatchError);
    expect(h.dispatched).toEqual([]);
  });
});

/**
 * Run `fn` with the global `reportError` removed, restoring the original
 * afterward. Proves the never-silent default host-independently: on a host
 * lacking `globalThis.reportError` the reporter of last resort is `console.error`.
 */
async function withoutGlobalReportError(
  fn: () => Promise<void>,
): Promise<void> {
  const globalRef = globalThis as { reportError?: (error: unknown) => void };
  const saved = globalRef.reportError;
  const hadOwn = Object.prototype.hasOwnProperty.call(
    globalThis,
    "reportError",
  );
  delete globalRef.reportError;
  try {
    await fn();
  } finally {
    if (hadOwn && saved !== undefined) globalRef.reportError = saved;
  }
}

describe("never-silent failure default", () => {
  it("falls back to console.error when the host lacks globalThis.reportError", async () => {
    await withoutGlobalReportError(async () => {
      const consoleError = vi
        .spyOn(hostConsole, "error")
        .mockImplementation(() => undefined);
      const h = harness(); // no onFailure observer registered
      const { root, fakeRoot } = await mountPanel(h);
      h.interactions.bind(root, "activate", h.activated, () => ({ at: "x" }));

      // The fake swallows the delivery throw; with no reportError global, the
      // failure must still surface — through console.error, never lost.
      h.renderer.simulateInteraction(
        fakeRoot,
        "activate",
        42 as unknown as JsonObject,
      );
      await h.interactions.settled();

      expect(consoleError).toHaveBeenCalledTimes(1);
      const reported = consoleError.mock.calls[0]?.[0] as Error;
      expect(reported).toBeInstanceOf(Error);
      // The original error is carried as the reported error's cause.
      expect(reported.cause).toBeInstanceOf(NonObjectSnapshotError);
      expect(h.dispatched).toEqual([]);
    });
  });

  it("prefers globalThis.reportError when the host provides it, selected at call time", async () => {
    const reportError = vi.fn();
    const globalRef = globalThis as { reportError?: (error: unknown) => void };
    const saved = globalRef.reportError;
    const hadOwn = Object.prototype.hasOwnProperty.call(
      globalThis,
      "reportError",
    );
    globalRef.reportError = reportError;
    try {
      const consoleError = vi
        .spyOn(hostConsole, "error")
        .mockImplementation(() => undefined);
      const h = harness(); // no onFailure observer registered
      const { root, fakeRoot } = await mountPanel(h);
      h.interactions.bind(root, "activate", h.activated, () => ({ at: "x" }));

      h.renderer.simulateInteraction(
        fakeRoot,
        "activate",
        42 as unknown as JsonObject,
      );
      await h.interactions.settled();

      // The host reporter is selected at call time; console.error is untouched.
      expect(reportError).toHaveBeenCalledTimes(1);
      const reported = reportError.mock.calls[0]?.[0] as Error;
      expect(reported).toBeInstanceOf(Error);
      expect(reported.cause).toBeInstanceOf(NonObjectSnapshotError);
      expect(consoleError).not.toHaveBeenCalled();
      expect(h.dispatched).toEqual([]);
    } finally {
      if (hadOwn && saved !== undefined) globalRef.reportError = saved;
      else delete globalRef.reportError;
    }
  });

  it("contains a throwing observer and routes its error to the reporter of last resort", async () => {
    await withoutGlobalReportError(async () => {
      const consoleError = vi
        .spyOn(hostConsole, "error")
        .mockImplementation(() => undefined);
      const observerError = new Error("observer blew up");
      const runtime = createRuntime({ id: "throwing-observer" });
      const components = createComponentRuntime(runtime);
      const templates = createTemplateRuntime(runtime);
      const renderer = createFakeRenderer();
      const projection = createProjectionRuntime(runtime, renderer);
      const events = createEventRuntime(runtime, {});
      const activated = createEventClass("editor.activated", {
        at: eventField((value) => typeof value === "string"),
      });
      events.register(activated);
      const interactions = createInteractionBinding(
        runtime,
        projection,
        events,
        {
          onFailure: () => {
            throw observerError;
          },
        },
      );
      const h = {
        runtime,
        components,
        templates,
        renderer,
        projection,
        events,
        activated,
        interactions,
        dispatched: [] as JsonObject[],
        failures: [] as InteractionFailure[],
      };
      const { root, fakeRoot } = await mountPanel(h);
      interactions.bind(root, "activate", activated, () => ({ at: "x" }));

      // The throw must not escape the simulation (the swallow bug being fixed).
      expect(() =>
        renderer.simulateInteraction(
          fakeRoot,
          "activate",
          42 as unknown as JsonObject,
        ),
      ).not.toThrow();
      await interactions.settled();

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError.mock.calls[0]?.[0]).toBe(observerError);
    });
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

  it("surfaces neither event nor failure for a delivery racing release", async () => {
    // A capturing port whose removeRoot keeps the delivery callback callable,
    // isolating the binding's own liveness re-check from port removal. Liveness
    // gates before #report, so no reporter of last resort fires either.
    const consoleError = vi
      .spyOn(hostConsole, "error")
      .mockImplementation(() => undefined);
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
    const failures: InteractionFailure[] = [];
    const interactions = createInteractionBinding(runtime, projection, events, {
      onFailure: (failure) => failures.push(failure),
    });

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
    // The adapter reports a malformed interaction that was already in flight:
    // liveness gates failure surfacing too, so this raises no report.
    captured?.(42 as unknown as JsonObject);
    await releasing;
    await interactions.settled();

    expect(dispatched).toEqual([]);
    expect(failures).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
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

  it("exports the failure-channel type surface", () => {
    // Type-only exports are erased at runtime, so assert they are usable at the
    // type level against the public barrel (compilation is the assertion).
    type Reason = publicApi.InteractionFailureReason;
    type Failure = publicApi.InteractionFailure;
    type Observer = publicApi.InteractionFailureObserver;
    type Options = publicApi.InteractionBindingOptions;
    const reason: Reason = "dispatch-error";
    const failure: Failure = {
      root: undefined as unknown as RootHandle,
      type: "activate",
      reason,
      cause: new Error("x"),
    };
    const observer: Observer = (received) => void received;
    const options: Options = { onFailure: observer };
    expect(failure.reason).toBe("dispatch-error");
    expect(typeof options.onFailure).toBe("function");
    expect(publicApi.NonObjectSnapshotError).toBeDefined();
    expect(publicApi.InvalidInteractionPayloadError).toBeDefined();
  });
});
