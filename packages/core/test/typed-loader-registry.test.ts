import { describe, expect, it } from "vitest";

import { createLocalClassSlug } from "../src/identity.js";
import {
  DuplicateLoaderError,
  InvalidLoaderDefinitionError,
  LoaderConflictError,
  LoaderInFlightError,
  LoaderKindError,
  MissingLoaderError,
} from "../src/loader-errors.js";
import { LifecycleError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";
import {
  TypedLoaderRegistry,
  createLoaderKind,
} from "../src/typed-loader-registry.js";

const alpha = createLoaderKind("alpha");
const beta = createLoaderKind("beta");
const noDefinitions = () => [];

describe("typed loader registry", () => {
  it("creates immutable reusable definitions and isolated registrations", () => {
    const definition = alpha.define("app.editor", noDefinitions);
    const firstRuntime = createRuntime({ id: "admin" });
    const secondRuntime = createRuntime({ id: "admin" });
    const first = new TypedLoaderRegistry(firstRuntime, alpha.kind).register(
      definition,
    );
    const second = new TypedLoaderRegistry(secondRuntime, alpha.kind).register(
      definition,
    );

    expect(Object.isFrozen(definition)).toBe(true);
    expect(first.id).toBe("admin::alpha-loader/app.editor");
    expect(second.id).toBe(first.id);
    expect(firstRuntime.owns(first)).toBe(true);
    expect(firstRuntime.owns(second)).toBe(false);
    expect(first.definition).toBe(definition);
    expect(second.definition).toBe(definition);
  });

  it("rejects duplicate namespaces and kind mismatches without mutation", () => {
    const runtime = createRuntime({ id: "test" });
    const registry = new TypedLoaderRegistry(runtime, alpha.kind);
    const original = alpha.define("app", noDefinitions);
    const registration = registry.register(original);

    expect(() => registry.register(alpha.define("app", noDefinitions))).toThrow(
      DuplicateLoaderError,
    );
    expect(() => registry.register(beta.define("app", noDefinitions))).toThrow(
      LoaderKindError,
    );
    expect(() => registry.register({ ...original })).toThrow(
      InvalidLoaderDefinitionError,
    );
    const lease = registry.select(createLocalClassSlug("app.item"));
    expect(lease?.registration).toBe(registration);
    lease?.release();
  });

  it("selects deepest named namespace and uses root only when needed", () => {
    const registry = new TypedLoaderRegistry(
      createRuntime({ id: "test" }),
      alpha.kind,
    );
    const root = registry.register(alpha.define(undefined, noDefinitions));
    registry.register(alpha.define("app", noDefinitions));
    const editor = registry.register(alpha.define("app.editor", noDefinitions));

    const namedLease = registry.select(
      createLocalClassSlug("app.editor.dialog"),
    );
    expect(namedLease?.registration).toBe(editor);
    namedLease?.release();

    const rootLease = registry.select(createLocalClassSlug("other.item"));
    expect(rootLease?.registration).toBe(root);
    rootLease?.release();
  });

  it("protects in-flight loaders from replacement and unregister", async () => {
    const registry = new TypedLoaderRegistry(
      createRuntime({ id: "test" }),
      alpha.kind,
    );
    const original = alpha.define("app", noDefinitions);
    const registration = registry.register(original);
    const lease = registry.select(createLocalClassSlug("app.item"));

    await expect(
      registry.replace(alpha.define("app", noDefinitions)),
    ).rejects.toBeInstanceOf(LoaderInFlightError);
    await expect(
      registry.unregister(original.namespace),
    ).rejects.toBeInstanceOf(LoaderInFlightError);
    expect(lease?.registration).toBe(registration);
    expect(registration.status).toBe("active");

    lease?.release();
    lease?.release();
    const replacement = await registry.replace(
      alpha.define("app", noDefinitions),
    );
    expect(replacement.revision).toBeGreaterThan(registration.revision);
    expect(replacement.previousRevision).toBe(registration.revision);
    expect(registration.status).toBe("released");
    expect(() => registration.definition).toThrow(LifecycleError);
  });

  it("unregisters idle loaders and rejects concurrent mutations", async () => {
    const registry = new TypedLoaderRegistry(
      createRuntime({ id: "test" }),
      alpha.kind,
    );
    const definition = alpha.define("app", noDefinitions);
    const registration = registry.register(definition);
    const first = registry.unregister(definition.namespace);
    const second = registry.unregister(definition.namespace);

    await first;
    await expect(second).rejects.toBeInstanceOf(LoaderConflictError);
    expect(registration.status).toBe("released");
    expect(registry.select(createLocalClassSlug("app.item"))).toBeUndefined();
    await expect(
      registry.unregister(definition.namespace),
    ).rejects.toBeInstanceOf(MissingLoaderError);
    expect(definition.namespace).toBe("app");
  });
});
