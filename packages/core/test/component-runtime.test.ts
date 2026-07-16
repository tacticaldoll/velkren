import { describe, expect, it } from "vitest";

import {
  ComponentTreeError,
  createComponentClass,
  DuplicateComponentRuntimeError,
  InvalidReferenceError,
  ScopeResolutionError,
  type ComponentInstance,
  type Reference,
} from "../src/component-class.js";
import { createComponentRuntime } from "../src/component-runtime.js";
import type { CanonicalClassId } from "../src/identity.js";
import { ManagedCreationError } from "../src/registration-errors.js";
import {
  LifecycleError,
  ManagedReleaseError,
  OwnershipError,
} from "../src/runtime-errors.js";
import { MissingRegistrationError } from "../src/registration-errors.js";
import { createRuntime } from "../src/runtime.js";

function domain(id: string) {
  return createComponentRuntime(createRuntime({ id }));
}

const missingId = "component/missing.item" as CanonicalClassId;

describe("managed component creation", () => {
  it("creates an owned active instance from an active registration", async () => {
    const app = domain("app");
    const panel = createComponentClass("editor.panel", ({ instance }) => {
      expect(instance.status).toBe("active");
      return "panel-value";
    });
    const registration = app.register(panel);

    const instance = await app.create(registration);

    expect(instance.id).toBe("app::component-instance/component-1");
    expect(instance.classId).toBe(panel.id);
    expect(instance.value).toBe("panel-value");
    expect(app.runtime.owns(instance)).toBe(true);
    expect(instance.parent).toBeUndefined();
    expect(instance.children).toEqual([]);

    await instance.release();
    expect(() => instance.value).toThrow(LifecycleError);
  });

  it("rejects creation from a missing registration", async () => {
    const app = domain("app");
    await expect(app.create(missingId)).rejects.toBeInstanceOf(
      MissingRegistrationError,
    );
  });

  it("rejects a foreign registration with an ownership error", async () => {
    const panel = createComponentClass("editor.panel", () => "panel");
    const first = domain("first");
    const second = domain("second");
    const foreign = first.register(panel);
    await expect(second.create(foreign)).rejects.toBeInstanceOf(OwnershipError);
  });

  it("rolls back in reverse order when creation behavior fails", async () => {
    const app = domain("app");
    const order: string[] = [];
    const cause = new Error("creation failed");
    let temporary: ComponentInstance | undefined;
    const panel = createComponentClass(
      "editor.panel",
      ({ instance, addCleanup }) => {
        temporary = instance;
        addCleanup(() => order.push("first"));
        addCleanup(() => order.push("second"));
        throw cause;
      },
    );
    app.register(panel);

    const creation = app.create(panel.id);
    await expect(creation).rejects.toBeInstanceOf(ManagedCreationError);
    await expect(creation).rejects.toMatchObject({ cause });
    expect(order).toEqual(["second", "first"]);
    expect(temporary?.status).toBe("released");
  });
});

describe("logical instance trees", () => {
  async function tree() {
    const app = domain("app");
    const order: string[] = [];
    const make = (slug: string) =>
      createComponentClass(slug, ({ addCleanup }) => {
        addCleanup(() => order.push(slug));
        return slug;
      });
    const parent = await app.create(app.register(make("parent")));
    const childA = await app.create(app.register(make("child.a")));
    const childB = await app.create(app.register(make("child.b")));
    return { app, order, parent, childA, childB };
  }

  it("attaches a child as an ordered member reporting its parent", async () => {
    const { app, parent, childA, childB } = await tree();
    app.attach(parent, childA);
    app.attach(parent, childB);
    expect(parent.children).toEqual([childA, childB]);
    expect(childA.parent).toBe(parent);
    expect(childB.parent).toBe(parent);
  });

  it("rejects cross-runtime attachment before mutation", async () => {
    const { app, parent } = await tree();
    const other = domain("other");
    const foreign = await other.create(
      other.register(createComponentClass("foreign", () => "x")),
    );
    expect(() => app.attach(parent, foreign)).toThrow(OwnershipError);
    expect(parent.children).toEqual([]);
  });

  it("rejects cyclic and reparented attachment", async () => {
    const { app, parent, childA, childB } = await tree();
    app.attach(parent, childA);
    app.attach(childA, childB);
    // Genuine cycle: parent is unattached but is an ancestor of childB.
    expect(() => app.attach(childB, parent)).toThrow(ComponentTreeError);
    expect(() => app.attach(parent, parent)).toThrow(ComponentTreeError);
    // childA already has a parent -> reparenting rejected.
    expect(() => app.attach(childB, childA)).toThrow(ComponentTreeError);
  });

  it("cascades release to descendants in reverse attachment order", async () => {
    const { app, order, parent, childA, childB } = await tree();
    app.attach(parent, childA);
    app.attach(parent, childB);

    await parent.release();

    expect(order).toEqual(["child.b", "child.a", "parent"]);
    expect(childA.status).toBe("released");
    expect(childB.status).toBe("released");
    expect(parent.status).toBe("released");
  });

  it("detaches a directly released child and keeps the parent active", async () => {
    const { app, parent, childA } = await tree();
    app.attach(parent, childA);
    await childA.release();
    expect(childA.status).toBe("released");
    expect(parent.status).toBe("active");
    expect(parent.children).toEqual([]);
  });

  it("aggregates cascade cleanup failures while releasing every node", async () => {
    const app = domain("app");
    const parent = await app.create(
      app.register(createComponentClass("parent", () => "parent")),
    );
    const child = await app.create(
      app.register(
        createComponentClass("child", ({ addCleanup }) => {
          addCleanup(() => {
            throw new Error("child cleanup failed");
          });
          return "child";
        }),
      ),
    );
    app.attach(parent, child);

    await expect(parent.release()).rejects.toBeInstanceOf(ManagedReleaseError);
    expect(child.status).toBe("released");
    expect(child.tombstone?.releaseFailed).toBe(true);
    expect(parent.status).toBe("released");
    expect(parent.tombstone?.releaseFailed).toBe(true);
  });

  it("is idempotent across repeated release", async () => {
    const app = domain("app");
    let cleanups = 0;
    const parent = await app.create(
      app.register(
        createComponentClass("parent", ({ addCleanup }) => {
          addCleanup(() => {
            cleanups += 1;
          });
          return "parent";
        }),
      ),
    );
    await parent.release();
    await parent.release();
    expect(cleanups).toBe(1);
    expect(parent.status).toBe("released");
  });
});

describe("scopes and references", () => {
  async function instance(id = "app") {
    const app = domain(id);
    const inst = await app.create(
      app.register(createComponentClass("editor.panel", () => "panel")),
    );
    return { app, inst };
  }

  it("dereferences a live instance through an owner-validated reference", async () => {
    const { app, inst } = await instance();
    const reference = app.reference(inst);
    expect(reference.targetId).toBe(inst.id);
    expect(reference.deref()).toBe(inst);
    expect(app.runtime.owns(reference)).toBe(true);
  });

  it("fails to dereference a released target", async () => {
    const { app, inst } = await instance();
    const reference = app.reference(inst);
    await inst.release();
    expect(() => reference.deref()).toThrow(LifecycleError);
  });

  it("resolves names through the scope chain and fails explicitly otherwise", async () => {
    const { app, inst } = await instance();
    const reference = app.reference(inst);
    const scope = app.createScope({ panel: reference });

    expect(scope.has("panel")).toBe(true);
    expect(scope.resolve("panel")).toBe(reference);
    expect(scope.resolve("panel").deref()).toBe(inst);
    expect(scope.has("missing")).toBe(false);
    expect(() => scope.resolve("missing")).toThrow(ScopeResolutionError);
  });

  it("extends a parent scope without mutating it", async () => {
    const { app, inst } = await instance();
    const refA = app.reference(inst);
    const second = await app.create(
      app.register(createComponentClass("editor.field", () => "field")),
    );
    const refB = app.reference(second);
    const parent = app.createScope({ a: refA });
    const child = app.createChildScope(parent, { b: refB });

    expect(child.resolve("a")).toBe(refA);
    expect(child.resolve("b")).toBe(refB);
    expect(parent.has("b")).toBe(false);
    expect(() => parent.resolve("b")).toThrow(ScopeResolutionError);
  });

  it("rejects an imitation reference placed into a scope", async () => {
    const { app } = await instance();
    const imitation = Object.freeze({
      targetId: "app::component-instance/component-1",
      deref: () => {
        throw new Error("nope");
      },
    }) as unknown as Reference;
    expect(() => app.createScope({ panel: imitation })).toThrow(
      InvalidReferenceError,
    );
  });

  it("rejects a foreign reference placed into a scope", async () => {
    const first = await instance("first");
    const second = await instance("second");
    const foreignReference = second.app.reference(second.inst);
    expect(() => first.app.createScope({ panel: foreignReference })).toThrow(
      OwnershipError,
    );
  });
});

describe("component domain boundary", () => {
  it("allows only one component domain per runtime", () => {
    const runtime = createRuntime({ id: "app" });
    createComponentRuntime(runtime);
    expect(() => createComponentRuntime(runtime)).toThrow(
      DuplicateComponentRuntimeError,
    );
  });

  it("runs the full component flow in Node.js without browser globals", async () => {
    const app = domain("app");
    const parent = await app.create(
      app.register(createComponentClass("app.root", () => "root")),
    );
    const child = await app.create(
      app.register(createComponentClass("app.child", () => "child")),
    );
    app.attach(parent, child);
    const scope = app.createScope({ child: app.reference(child) });
    expect(scope.resolve("child").deref()).toBe(child);
    await parent.release();
    expect(child.status).toBe("released");
  });
});
