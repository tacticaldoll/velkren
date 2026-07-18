import { describe, expect, it } from "vitest";

import { createComponentClass } from "../src/component-class.js";
import { createComponentRuntime } from "../src/component-runtime.js";
import { createFakeRenderer } from "../src/fake-renderer.js";
import { createProjectionRuntime } from "../src/projection-runtime.js";
import {
  InvalidRendererPortError,
  PROJECTION_IDENTITY_ATTRIBUTE,
  type RootHandle,
} from "../src/renderer-port.js";
import { OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";
import { createTemplateClass } from "../src/template-class.js";
import { createTemplateRuntime } from "../src/template-runtime.js";
import * as publicApi from "../src/index.js";

function harness(id = "app") {
  const runtime = createRuntime({ id });
  const components = createComponentRuntime(runtime);
  const templates = createTemplateRuntime(runtime);
  const renderer = createFakeRenderer();
  const projection = createProjectionRuntime(runtime, renderer);
  return { runtime, components, templates, renderer, projection };
}

async function panelInstance(
  components: ReturnType<typeof harness>["components"],
) {
  return components.create(
    components.register(createComponentClass("editor.panel", () => "panel")),
  );
}

function multiRootTemplate() {
  return createTemplateClass("editor.panel.default", {
    component: "component/editor.panel",
    roots: {
      main: { kind: "box", attributes: { role: "main" } },
      aside: { kind: "rail" },
    },
  });
}

describe("renderer port validation", () => {
  it("rejects a non-conforming renderer", () => {
    const runtime = createRuntime({ id: "app" });
    expect(() => createProjectionRuntime(runtime, { createRoot() {} })).toThrow(
      InvalidRendererPortError,
    );
    expect(() => createProjectionRuntime(runtime, null)).toThrow(
      InvalidRendererPortError,
    );
  });

  it("rejects a renderer missing only registerInteraction", () => {
    const runtime = createRuntime({ id: "app" });
    const withoutInteraction = {
      createRoot() {},
      commit() {},
      readIdentity() {
        return undefined;
      },
      removeRoot() {},
    };
    expect(() => createProjectionRuntime(runtime, withoutInteraction)).toThrow(
      InvalidRendererPortError,
    );
  });

  it("accepts a conforming stub including registerInteraction", () => {
    const runtime = createRuntime({ id: "app" });
    const conforming = {
      createRoot() {},
      commit() {},
      readIdentity() {
        return undefined;
      },
      removeRoot() {},
      registerInteraction() {
        return { remove() {} };
      },
    };
    expect(() => createProjectionRuntime(runtime, conforming)).not.toThrow();
  });
});

describe("managed RootHandle projection", () => {
  it("mounts one owner-validated RootHandle per named root", async () => {
    const h = harness();
    h.templates.register(multiRootTemplate());
    const instance = await panelInstance(h.components);
    const projection = await h.projection.mount(
      instance,
      h.templates.resolvePlan(instance),
    );
    expect(Object.keys(projection.roots).sort()).toEqual(["aside", "main"]);
    expect(h.runtime.owns(projection.roots.main as RootHandle)).toBe(true);
    expect(projection.roots.main?.status).toBe("active");
    expect(h.renderer.roots()).toHaveLength(2);
  });

  it("rejects a foreign instance before invoking the port", async () => {
    const first = harness("first");
    const second = harness("second");
    second.templates.register(multiRootTemplate());
    const foreign = await panelInstance(second.components);
    const plan = second.templates.resolvePlan(foreign);
    await expect(first.projection.mount(foreign, plan)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    expect(first.renderer.roots()).toHaveLength(0);
  });

  it("removes a root through the port on idempotent release", async () => {
    const h = harness();
    h.templates.register(multiRootTemplate());
    const instance = await panelInstance(h.components);
    const projection = await h.projection.mount(
      instance,
      h.templates.resolvePlan(instance),
    );
    const main = projection.roots.main as RootHandle;
    const fakeRoot = h.renderer.roots()[0];
    await main.release();
    await main.release();
    expect(main.status).toBe("released");
    expect(fakeRoot?.removed).toBe(true);
  });

  it("releases every owned root when the projection is released", async () => {
    const h = harness();
    h.templates.register(multiRootTemplate());
    const instance = await panelInstance(h.components);
    const projection = await h.projection.mount(
      instance,
      h.templates.resolvePlan(instance),
    );
    await projection.release();
    expect(projection.roots.main?.status).toBe("released");
    expect(projection.roots.aside?.status).toBe("released");
    expect(h.renderer.roots().every((root) => root.removed)).toBe(true);
  });
});

describe("permanent identity and commit repair", () => {
  it("assigns a distinct stable identity per root and writes it to the surface", async () => {
    const h = harness();
    h.templates.register(multiRootTemplate());
    const instance = await panelInstance(h.components);
    const projection = await h.projection.mount(
      instance,
      h.templates.resolvePlan(instance),
    );
    const main = projection.roots.main as RootHandle;
    const aside = projection.roots.aside as RootHandle;
    expect(main.identity).not.toBe(aside.identity);
    const surfaceIds = h.renderer
      .roots()
      .map((root) => root.node.attributes[PROJECTION_IDENTITY_ATTRIBUTE]);
    expect(surfaceIds).toContain(main.identity);
    expect(surfaceIds).toContain(aside.identity);
  });

  it("keeps identity stable and repairs a removed attribute on commit", async () => {
    const h = harness();
    h.templates.register(multiRootTemplate());
    const instance = await panelInstance(h.components);
    const projection = await h.projection.mount(
      instance,
      h.templates.resolvePlan(instance),
    );
    const main = projection.roots.main as RootHandle;
    const before = main.identity;
    const fakeRoot = h.renderer
      .roots()
      .find(
        (root) =>
          root.node.attributes[PROJECTION_IDENTITY_ATTRIBUTE] === before,
      );
    // Simulate external removal of the identity attribute.
    delete fakeRoot?.node.attributes[PROJECTION_IDENTITY_ATTRIBUTE];

    h.projection.commit(main, {
      kind: "box2",
      attributes: {},
      children: [],
      slots: {},
    });

    expect(main.identity).toBe(before);
    expect(fakeRoot?.node.kind).toBe("box2");
    expect(fakeRoot?.node.attributes[PROJECTION_IDENTITY_ATTRIBUTE]).toBe(
      before,
    );
  });
});

describe("ownership independence and boundary", () => {
  it("rejects a foreign RootHandle on commit", async () => {
    const first = harness("first");
    const second = harness("second");
    first.templates.register(multiRootTemplate());
    second.templates.register(multiRootTemplate());
    const firstInstance = await panelInstance(first.components);
    const secondInstance = await panelInstance(second.components);
    await first.projection.mount(
      firstInstance,
      first.templates.resolvePlan(firstInstance),
    );
    const foreignProjection = await second.projection.mount(
      secondInstance,
      second.templates.resolvePlan(secondInstance),
    );
    const foreignRoot = foreignProjection.roots.main as RootHandle;
    expect(() =>
      first.projection.commit(foreignRoot, {
        kind: "x",
        attributes: {},
        children: [],
        slots: {},
      }),
    ).toThrow(OwnershipError);
  });

  it("rejects a structural imitation of a RootHandle", () => {
    const h = harness();
    const imitation = { rootName: "main" } as unknown as RootHandle;
    expect(() =>
      h.projection.commit(imitation, {
        kind: "x",
        attributes: {},
        children: [],
        slots: {},
      }),
    ).toThrow(OwnershipError);
  });

  it("exposes projection APIs without generic kernels", () => {
    expect(typeof publicApi.createProjectionRuntime).toBe("function");
    expect(typeof publicApi.createFakeRenderer).toBe("function");
    const names = new Set(Object.keys(publicApi));
    expect(names.has("TypedRegistry")).toBe(false);
    expect(names.has("DefaultProjectionRuntime")).toBe(false);
  });
});
