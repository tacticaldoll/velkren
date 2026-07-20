import { describe, expect, it } from "vitest";

import { createComponentClass } from "../src/component-class.js";
import { createComponentRuntime } from "../src/component-runtime.js";
import { createFakeRenderer, type FakeRenderer } from "../src/fake-renderer.js";
import { createProjectionRuntime } from "../src/projection-runtime.js";
import type { RootHandle } from "../src/renderer-port.js";
import { createRuntime } from "../src/runtime.js";
import { OwnershipError } from "../src/runtime-errors.js";
import { createStateRuntime } from "../src/state-runtime.js";
import {
  createStateBinding,
  DuplicateStateBindingRuntimeError,
  RootAlreadyBoundError,
} from "../src/state-binding.js";
import { createTemplateClass } from "../src/template-class.js";
import { createTemplateRuntime } from "../src/template-runtime.js";
import type { RenderNode } from "../src/template-class.js";

interface Editor {
  label: string;
}

const deriveEditor = (value: Editor): RenderNode => ({
  kind: "div",
  attributes: { label: value.label },
  children: [],
  slots: {},
});

function nodeLabel(renderer: FakeRenderer, root: RootHandle): unknown {
  const fake = renderer
    .roots()
    .find((r) => renderer.identityOf(r) === root.identity);
  return fake?.node.attributes.label;
}

async function mountRoot(id = "sb") {
  const runtime = createRuntime({ id });
  const components = createComponentRuntime(runtime);
  const templates = createTemplateRuntime(runtime);
  const renderer = createFakeRenderer();
  const projection = createProjectionRuntime(runtime, renderer);
  const state = createStateRuntime(runtime);

  const widget = createComponentClass(`${id}.widget`, () => ({}));
  components.register(widget);
  templates.register(
    createTemplateClass(widget.localSlug, {
      component: widget.id,
      roots: { main: { kind: "div" } },
    }),
  );
  const instance = await components.create(widget.id);
  const projected = await projection.mount(
    instance,
    templates.resolvePlan(instance),
  );
  const root = projected.roots.main;
  if (root === undefined) throw new Error("root was not projected");
  return { runtime, renderer, projection, state, instance, projected, root };
}

describe("state-binding domain", () => {
  it("rejects a second state-binding domain on the same runtime", async () => {
    const { runtime, projection } = await mountRoot();
    createStateBinding(runtime, projection);
    expect(() => createStateBinding(runtime, projection)).toThrow(
      DuplicateStateBindingRuntimeError,
    );
  });

  it("commits the initial state-derived view on bind", async () => {
    const { runtime, renderer, projection, state, root } = await mountRoot();
    const binding = createStateBinding(runtime, projection);
    const cell = state.create<Editor>({ label: "a" });
    binding.bind(root, cell, deriveEditor);
    expect(nodeLabel(renderer, root)).toBe("a");
  });

  it("re-commits the derived view when the bound state changes", async () => {
    const { runtime, renderer, projection, state, root } = await mountRoot();
    const binding = createStateBinding(runtime, projection);
    const cell = state.create<Editor>({ label: "a" });
    binding.bind(root, cell, deriveEditor);
    cell.update({ label: "b" });
    expect(nodeLabel(renderer, root)).toBe("b");
    cell.update((previous) => ({ label: previous.label + "!" }));
    expect(nodeLabel(renderer, root)).toBe("b!");
  });

  it("rejects a foreign-owned root or state", async () => {
    const a = await mountRoot("a");
    const b = await mountRoot("b");
    const binding = createStateBinding(a.runtime, a.projection);
    const foreignState = b.state.create<Editor>({ label: "x" });
    // Foreign root (owned by runtime b) bound through runtime a's domain.
    expect(() => binding.bind(b.root, foreignState, deriveEditor)).toThrow(
      OwnershipError,
    );
  });

  it("rejects binding a root that already has a live binding", async () => {
    const { runtime, projection, state, root } = await mountRoot();
    const binding = createStateBinding(runtime, projection);
    const cell = state.create<Editor>({ label: "a" });
    binding.bind(root, cell, deriveEditor);
    expect(() => binding.bind(root, cell, deriveEditor)).toThrow(
      RootAlreadyBoundError,
    );
  });

  it("allows rebinding a root after its binding is released", async () => {
    const { runtime, renderer, projection, state, root } = await mountRoot();
    const binding = createStateBinding(runtime, projection);
    const first = state.create<Editor>({ label: "a" });
    const handle = binding.bind(root, first, deriveEditor);
    handle.release();
    const second = state.create<Editor>({ label: "z" });
    binding.bind(root, second, deriveEditor);
    expect(nodeLabel(renderer, root)).toBe("z");
  });

  it("stops committing after release and is idempotent", async () => {
    const { runtime, renderer, projection, state, root } = await mountRoot();
    const binding = createStateBinding(runtime, projection);
    const cell = state.create<Editor>({ label: "a" });
    let derives = 0;
    const handle = binding.bind(root, cell, (v) => {
      derives += 1;
      return deriveEditor(v);
    });
    expect(derives).toBe(1); // initial
    handle.release();
    cell.update({ label: "b" });
    expect(derives).toBe(1); // no re-derive after release
    expect(nodeLabel(renderer, root)).toBe("a"); // view unchanged
    expect(() => handle.release()).not.toThrow(); // idempotent
  });

  it("is a no-op that self-heals when a change arrives after the root is released", async () => {
    const { runtime, projection, state, projected, root } = await mountRoot();
    const binding = createStateBinding(runtime, projection);
    const cell = state.create<Editor>({ label: "a" });
    let derives = 0;
    binding.bind(root, cell, (v) => {
      derives += 1;
      return deriveEditor(v);
    });
    await projected.release();
    // Updating after the root is released neither throws nor commits, and the
    // dead observation is removed: a second update also does not derive.
    expect(() => cell.update({ label: "b" })).not.toThrow();
    expect(derives).toBe(1);
    expect(() => cell.update({ label: "c" })).not.toThrow();
    expect(derives).toBe(1);
  });
});
