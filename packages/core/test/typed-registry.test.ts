import { describe, expect, it } from "vitest";

import { createDefinitionKind } from "../src/definition.js";
import { IdentityValidationError, createClassKind } from "../src/identity.js";
import {
  DuplicateRegistrationError,
  MissingRegistrationError,
  RegistrationConflictError,
  RegistrationDependencyError,
  RegistrationKindError,
} from "../src/registration-errors.js";
import { createRuntime } from "../src/runtime.js";
import { LifecycleError } from "../src/runtime-errors.js";
import { TypedRegistry } from "../src/typed-registry.js";

const alpha = createDefinitionKind("alpha");
const beta = createDefinitionKind("beta");

describe("typed definitions and registrations", () => {
  it("creates immutable canonical definitions and rejects prefixed slugs", () => {
    const definition = alpha.define("sample.item", () => undefined);

    expect(definition.id).toBe("alpha/sample.item");
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Reflect.set(definition, "localSlug", "changed")).toBe(false);
    expect(() => alpha.define("alpha/sample.item", () => undefined)).toThrow(
      IdentityValidationError,
    );
  });

  it("isolates reusable definitions by opaque runtime ownership", () => {
    const definition = alpha.define("sample.item", () => undefined);
    const firstRuntime = createRuntime({ id: "admin" });
    const secondRuntime = createRuntime({ id: "admin" });
    const first = new TypedRegistry(firstRuntime, alpha.kind).register(
      definition,
    );
    const second = new TypedRegistry(secondRuntime, alpha.kind).register(
      definition,
    );

    expect(first.id).toBe("admin::alpha/sample.item");
    expect(second.id).toBe(first.id);
    expect(firstRuntime.owns(first)).toBe(true);
    expect(firstRuntime.owns(second)).toBe(false);
  });

  it("allows equal slugs across kinds and rejects mismatches without mutation", () => {
    const runtime = createRuntime({ id: "test" });
    const alphaRegistry = new TypedRegistry(runtime, alpha.kind);
    const betaRegistry = new TypedRegistry(runtime, beta.kind);
    const alphaDefinition = alpha.define("sample.item", () => undefined);
    const betaDefinition = beta.define("sample.item", () => undefined);

    alphaRegistry.register(alphaDefinition);
    betaRegistry.register(betaDefinition);
    expect(alphaRegistry.resolve(alphaDefinition.id)?.classId).toBe(
      "alpha/sample.item",
    );
    expect(betaRegistry.resolve(betaDefinition.id)?.classId).toBe(
      "beta/sample.item",
    );
    expect(() => alphaRegistry.register(betaDefinition)).toThrow(
      RegistrationKindError,
    );
    expect(alphaRegistry.resolve(alphaDefinition.id)?.definition).toBe(
      alphaDefinition,
    );
  });

  it("rejects duplicate active registrations without replacement", () => {
    const registry = new TypedRegistry(
      createRuntime({ id: "test" }),
      alpha.kind,
    );
    const original = alpha.define("sample.item", () => "original");
    const duplicate = alpha.define("sample.item", () => "duplicate");
    const registration = registry.register(original);

    expect(() => registry.register(duplicate)).toThrow(
      DuplicateRegistrationError,
    );
    expect(registry.resolve(original.id)).toBe(registration);
  });

  it("replaces explicitly with runtime revisions and preserves definitions", async () => {
    const registry = new TypedRegistry(
      createRuntime({ id: "test" }),
      alpha.kind,
    );
    const original = alpha.define("sample.item", () => "original");
    const replacement = alpha.define("sample.item", () => "replacement");
    const first = registry.register(original);
    const second = await registry.replace(replacement);

    expect(second.revision).toBeGreaterThan(first.revision);
    expect(second.previousRevision).toBe(first.revision);
    expect(first.status).toBe("released");
    expect(second.definition).toBe(replacement);
    expect(original.id).toBe("alpha/sample.item");
  });

  it("rejects replacement with dependents and concurrent replacement", async () => {
    const registry = new TypedRegistry(
      createRuntime({ id: "test" }),
      alpha.kind,
    );
    const original = alpha.define("sample.item", () => "original");
    const firstReplacement = alpha.define("sample.item", () => "first");
    const secondReplacement = alpha.define("sample.item", () => "second");
    const registration = registry.register(original);
    registry.retain(registration);

    await expect(registry.replace(firstReplacement)).rejects.toBeInstanceOf(
      RegistrationDependencyError,
    );
    expect(registry.resolve(original.id)).toBe(registration);
    registry.releaseDependent(registration);

    const first = registry.replace(firstReplacement);
    const second = registry.replace(secondReplacement);
    const active = await first;
    await expect(second).rejects.toBeInstanceOf(RegistrationConflictError);
    expect(registry.resolve(original.id)).toBe(active);
    expect(active.revision).toBe(2);
  });

  it("unregisters only registrations without live dependents", async () => {
    const runtime = createRuntime({ id: "test" });
    const registry = new TypedRegistry(runtime, createClassKind("alpha"));
    const definition = alpha.define("sample.item", () => undefined);
    const registration = registry.register(definition);
    registry.retain(registration);

    await expect(registry.unregister(definition.id)).rejects.toBeInstanceOf(
      RegistrationDependencyError,
    );
    expect(registry.resolve(definition.id)).toBe(registration);

    registry.releaseDependent(registration);
    await registry.unregister(definition.id);
    expect(registry.resolve(definition.id)).toBeUndefined();
    expect(registration.status).toBe("released");
    expect(() => registration.definition).toThrow(LifecycleError);
    await expect(registry.unregister(definition.id)).rejects.toBeInstanceOf(
      MissingRegistrationError,
    );
    expect(definition.id).toBe("alpha/sample.item");
  });
});
