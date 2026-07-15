import { describe, expect, it } from "vitest";

import { IdentityValidationError } from "../src/identity.js";
import {
  createLoaderNamespace,
  createQualifiedLoaderId,
  namespaceContains,
  namespaceDepth,
  selectDeepestNamespace,
} from "../src/namespace-identity.js";
import { createRuntime, markRuntimeOwned } from "../src/runtime.js";

describe("loader namespace identity", () => {
  it("formats root, named, and qualified loader identities", () => {
    const root = createLoaderNamespace();
    const named = createLoaderNamespace("app.editor");

    expect(root).toBe("@root");
    expect(named).toBe("app.editor");
    expect(namespaceDepth(root)).toBe(0);
    expect(namespaceDepth(named)).toBe(2);
    expect(createQualifiedLoaderId("admin", "alpha", root)).toBe(
      "admin::alpha-loader/@root",
    );
    expect(createQualifiedLoaderId("admin", "alpha", named)).toBe(
      "admin::alpha-loader/app.editor",
    );
  });

  it.each(["", ".", "app..editor", "App.editor", "admin::app", "app/editor"])(
    "rejects invalid named namespace %j",
    (namespace) => {
      expect(() => createLoaderNamespace(namespace)).toThrow(
        IdentityValidationError,
      );
    },
  );

  it("matches only complete namespace segments", () => {
    const root = createLoaderNamespace();
    const app = createLoaderNamespace("app");
    const edit = createLoaderNamespace("app.edit");

    expect(namespaceContains(root, "other.item")).toBe(true);
    expect(namespaceContains(app, "app")).toBe(true);
    expect(namespaceContains(app, "app.editor.dialog")).toBe(true);
    expect(namespaceContains(edit, "app.editor.dialog")).toBe(false);
  });

  it("selects the deepest matching namespace with root as lowest priority", () => {
    const root = { namespace: createLoaderNamespace(), label: "root" };
    const app = { namespace: createLoaderNamespace("app"), label: "app" };
    const editor = {
      namespace: createLoaderNamespace("app.editor"),
      label: "editor",
    };

    expect(
      selectDeepestNamespace([root, editor, app], "app.editor.dialog")?.label,
    ).toBe("editor");
    expect(selectDeepestNamespace([app, root], "other.item")?.label).toBe(
      "root",
    );
    expect(selectDeepestNamespace([app], "other.item")).toBeUndefined();
  });

  it("does not treat equal readable runtime IDs as shared ownership", () => {
    const first = createRuntime({ id: "admin" });
    const second = createRuntime({ id: "admin" });
    const namespace = createLoaderNamespace("app.editor");
    const firstHandle = markRuntimeOwned(first, {
      id: createQualifiedLoaderId(first.id, "alpha", namespace),
    });
    const secondHandle = markRuntimeOwned(second, {
      id: createQualifiedLoaderId(second.id, "alpha", namespace),
    });

    expect(firstHandle.id).toBe(secondHandle.id);
    expect(first.owns(firstHandle)).toBe(true);
    expect(first.owns(secondHandle)).toBe(false);
  });
});
