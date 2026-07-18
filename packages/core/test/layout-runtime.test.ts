import { describe, expect, it } from "vitest";

import { createComponentClass } from "../src/component-class.js";
import { createComponentRuntime } from "../src/component-runtime.js";
import { createFakeRenderer } from "../src/fake-renderer.js";
import {
  createLayoutRuntime,
  DuplicateLayoutRuntimeError,
  LayoutPhaseError,
  LayoutRegistrationError,
  type LayoutContract,
} from "../src/layout-runtime.js";
import { createProjectionRuntime } from "../src/projection-runtime.js";
import type { RootHandle } from "../src/renderer-port.js";
import { OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";
import { createTemplateClass } from "../src/template-class.js";
import { createTemplateRuntime } from "../src/template-runtime.js";
import * as publicApi from "../src/index.js";

function harness(id = "app") {
  const runtime = createRuntime({ id });
  const components = createComponentRuntime(runtime);
  const templates = createTemplateRuntime(runtime);
  const projection = createProjectionRuntime(runtime, createFakeRenderer());
  const layout = createLayoutRuntime(runtime);
  return { runtime, components, templates, projection, layout };
}

function template() {
  return createTemplateClass("editor.panel.default", {
    component: "component/editor.panel",
    roots: { main: { kind: "box" }, aside: { kind: "rail" } },
  });
}

async function roots(h: ReturnType<typeof harness>) {
  h.templates.register(template());
  const instance = await h.components.create(
    h.components.register(createComponentClass("editor.panel", () => "panel")),
  );
  const projection = await h.projection.mount(
    instance,
    h.templates.resolvePlan(instance),
  );
  return {
    main: projection.roots.main as RootHandle,
    aside: projection.roots.aside as RootHandle,
  };
}

const noop: LayoutContract = {
  measure() {},
  calculate() {},
  apply() {},
};

describe("handle-only layout registration", () => {
  it("registers a contract for an owned active handle", async () => {
    const h = harness();
    const { main } = await roots(h);
    expect(() => h.layout.register(main, noop)).not.toThrow();
  });

  it("rejects a foreign or non-handle target", async () => {
    const first = harness("first");
    const second = harness("second");
    const foreign = (await roots(second)).main;
    expect(() => first.layout.register(foreign, noop)).toThrow(OwnershipError);
    expect(() =>
      first.layout.register("not-a-handle" as unknown as RootHandle, noop),
    ).toThrow(OwnershipError);
  });

  it("rejects a duplicate contract for the same handle", async () => {
    const h = harness();
    const { main } = await roots(h);
    h.layout.register(main, noop);
    expect(() => h.layout.register(main, noop)).toThrow(
      LayoutRegistrationError,
    );
  });

  it("allows only one layout coordinator per runtime", () => {
    const runtime = createRuntime({ id: "app" });
    createLayoutRuntime(runtime);
    expect(() => createLayoutRuntime(runtime)).toThrow(
      DuplicateLayoutRuntimeError,
    );
  });
});

describe("deterministic three-phase passes", () => {
  it("runs phases in order across handles in registration order", async () => {
    const h = harness();
    const { main, aside } = await roots(h);
    const trace: string[] = [];
    const contract = (name: string): LayoutContract => ({
      measure() {
        trace.push(`measure:${name}`);
      },
      calculate() {
        trace.push(`calculate:${name}`);
      },
      apply() {
        trace.push(`apply:${name}`);
      },
    });
    h.layout.register(main, contract("main"));
    h.layout.register(aside, contract("aside"));
    h.layout.invalidate(main);
    h.layout.invalidate(aside);

    h.layout.flush();

    expect(trace).toEqual([
      "measure:main",
      "measure:aside",
      "calculate:main",
      "calculate:aside",
      "apply:main",
      "apply:aside",
    ]);
  });

  it("carries a per-handle scratch across phases", async () => {
    const h = harness();
    const { main } = await roots(h);
    let seen: unknown;
    h.layout.register(main, {
      measure(ctx) {
        ctx.scratch.width = 42;
      },
      calculate(ctx) {
        ctx.scratch.doubled = (ctx.scratch.width as number) * 2;
      },
      apply(ctx) {
        seen = ctx.scratch.doubled;
      },
    });
    h.layout.invalidate(main);
    h.layout.flush();
    expect(seen).toBe(84);
  });
});

describe("invalidation drives passes", () => {
  it("processes only invalidated handles and clears dirty state", async () => {
    const h = harness();
    const { main, aside } = await roots(h);
    const runs: string[] = [];
    const contract = (name: string): LayoutContract => ({
      measure() {
        runs.push(name);
      },
      calculate() {},
      apply() {},
    });
    h.layout.register(main, contract("main"));
    h.layout.register(aside, contract("aside"));
    h.layout.invalidate(main);

    h.layout.flush();
    expect(runs).toEqual(["main"]);

    // Dirty state cleared: a second flush with no new invalidation is a no-op.
    h.layout.flush();
    expect(runs).toEqual(["main"]);
  });

  it("rejects invalidating an unregistered handle", async () => {
    const h = harness();
    const { main } = await roots(h);
    expect(() => h.layout.invalidate(main)).toThrow(LayoutRegistrationError);
  });
});

describe("synchronous enforcement and handle lifetime", () => {
  it("rejects an asynchronous phase hook", async () => {
    const h = harness();
    const { main } = await roots(h);
    h.layout.register(main, {
      measure() {
        return Promise.resolve() as unknown as void;
      },
      calculate() {},
      apply() {},
    });
    h.layout.invalidate(main);
    expect(() => h.layout.flush()).toThrow(LayoutPhaseError);
  });

  it("drops a released handle's binding and does not process it", async () => {
    const h = harness();
    const { main, aside } = await roots(h);
    const runs: string[] = [];
    h.layout.register(main, {
      measure() {
        runs.push("main");
      },
      calculate() {},
      apply() {},
    });
    h.layout.register(aside, {
      measure() {
        runs.push("aside");
      },
      calculate() {},
      apply() {},
    });
    h.layout.invalidate(main);
    h.layout.invalidate(aside);
    await main.release();

    h.layout.flush();
    expect(runs).toEqual(["aside"]);
    // The released handle can no longer be invalidated.
    expect(() => h.layout.invalidate(main)).toThrow(LayoutRegistrationError);
  });
});

describe("layout boundary", () => {
  it("exposes layout APIs without generic kernels", () => {
    expect(typeof publicApi.createLayoutRuntime).toBe("function");
    expect(publicApi.LayoutPhase.Measure).toBe("measure");
    const names = new Set(Object.keys(publicApi));
    expect(names.has("TypedRegistry")).toBe(false);
    expect(names.has("DefaultLayoutRuntime")).toBe(false);
  });
});
