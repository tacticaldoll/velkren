import { describe, expect, it } from "vitest";

import { createDefinitionKind } from "../src/definition.js";
import { ManagedFactory } from "../src/managed-factory.js";
import type { ManagedObject } from "../src/managed-lifecycle.js";
import {
  ManagedCreationError,
  MissingRegistrationError,
  RegistrationDependencyError,
} from "../src/registration-errors.js";
import { LifecycleError, OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";
import { TypedRegistry } from "../src/typed-registry.js";

const alpha = createDefinitionKind<string>("alpha");

function createHarness() {
  const runtime = createRuntime({ id: "test" });
  const registry = new TypedRegistry<string>(runtime, alpha.kind);
  const factory = new ManagedFactory(runtime, registry);
  return { factory, registry, runtime };
}

describe("central managed factory", () => {
  it("creates an owned active instance from an active registration", async () => {
    const { factory, registry, runtime } = createHarness();
    const definition = alpha.define("sample.item", ({ instance }) => {
      expect(instance.status).toBe("active");
      expect(runtime.owns(instance)).toBe(true);
      return "created";
    });
    const registration = registry.register(definition);

    const instance = await factory.create(registration);

    expect(instance.id).toMatch(/^test::alpha-instance\/managed-[0-9]+$/);
    expect(instance.classId).toBe(definition.id);
    expect(instance.value).toBe("created");
    await expect(registry.unregister(definition.id)).rejects.toBeInstanceOf(
      RegistrationDependencyError,
    );
    await instance.release();
    expect(() => instance.value).toThrow(LifecycleError);
    await registry.unregister(definition.id);
  });

  it("rejects missing, released, and foreign registrations before behavior", async () => {
    const first = createHarness();
    const second = createHarness();
    let calls = 0;
    const definition = alpha.define("sample.item", () => {
      calls += 1;
      return "created";
    });
    const registration = first.registry.register(definition);
    const missingDefinition = alpha.define("missing.item", () => "missing");

    await expect(
      first.factory.create(missingDefinition.id),
    ).rejects.toBeInstanceOf(MissingRegistrationError);
    await expect(second.factory.create(registration)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await first.registry.unregister(definition.id);
    await expect(first.factory.create(registration)).rejects.toBeInstanceOf(
      LifecycleError,
    );
    expect(calls).toBe(0);
  });

  it("rejects a same-runtime registration from another registry before allocation", async () => {
    const runtime = createRuntime({ id: "test" });
    const firstRegistry = new TypedRegistry<string>(runtime, alpha.kind);
    const secondRegistry = new TypedRegistry<string>(runtime, alpha.kind);
    const factory = new ManagedFactory(runtime, firstRegistry);
    let calls = 0;
    const definition = alpha.define("sample.item", () => {
      calls += 1;
      return "created";
    });
    const foreignRegistration = secondRegistry.register(definition);

    await expect(factory.create(foreignRegistration)).rejects.toBeInstanceOf(
      MissingRegistrationError,
    );
    const ownedRegistration = firstRegistry.register(definition);
    const instance = await factory.create(ownedRegistration);
    expect(instance.id).toBe("test::alpha-instance/managed-1");
    expect(calls).toBe(1);
    await instance.release();
  });

  it("does not publish an instance released by its creation behavior", async () => {
    const { factory, registry } = createHarness();
    const definition = alpha.define("sample.item", async ({ instance }) => {
      await instance.release();
      return "released";
    });
    registry.register(definition);

    const failure: unknown = await factory
      .create(definition.id)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ManagedCreationError);
    expect((failure as ManagedCreationError).cause).toBeInstanceOf(
      LifecycleError,
    );
    await registry.unregister(definition.id);
  });

  it("rolls back in reverse order and preserves creation and cleanup failures", async () => {
    const { factory, registry } = createHarness();
    const calls: string[] = [];
    const creationCause = new Error("definition failed");
    const cleanupFailure = new Error("cleanup failed");
    let temporary: ManagedObject | undefined;
    const definition = alpha.define(
      "sample.item",
      ({ instance, addCleanup }) => {
        temporary = instance;
        addCleanup(() => {
          calls.push("first");
          throw cleanupFailure;
        });
        addCleanup(() => calls.push("second"));
        throw creationCause;
      },
    );
    registry.register(definition);

    const creation = factory.create(definition.id);
    await expect(creation).rejects.toMatchObject({
      cause: creationCause,
      cleanupFailures: [cleanupFailure],
    });
    await expect(creation).rejects.toBeInstanceOf(ManagedCreationError);
    expect(calls).toEqual(["second", "first"]);
    expect(temporary?.status).toBe("released");

    await registry.unregister(definition.id);
  });
});
