import { describe, expect, it } from "vitest";

import { createDefinitionKind } from "../src/definition.js";
import {
  DuplicateRegistrationError,
  RegistrationBatchError,
  RegistrationKindError,
} from "../src/registration-errors.js";
import { createRuntime } from "../src/runtime.js";
import type { Registration } from "../src/typed-registry.js";
import { TypedRegistry } from "../src/typed-registry.js";

const alpha = createDefinitionKind("alpha");
const beta = createDefinitionKind("beta");

function createRegistry() {
  return new TypedRegistry(createRuntime({ id: "test" }), alpha.kind);
}

describe("typed registration batch", () => {
  it("publishes a complete batch with deterministic revisions", async () => {
    const registry = createRegistry();
    const first = alpha.define("app.first", () => "first");
    const second = alpha.define("app.second", () => "second");

    const registrations = await registry.registerBatch([first, second]);

    expect(Object.isFrozen(registrations)).toBe(true);
    expect(registrations.map(({ revision }) => revision)).toEqual([1, 2]);
    expect(registry.resolve(first.id)).toBe(registrations[0]);
    expect(registry.resolve(second.id)).toBe(registrations[1]);
    expect(
      registry.register(alpha.define("app.third", () => "third")).revision,
    ).toBe(3);
  });

  it("prevalidates duplicates, active conflicts, and kind mismatches", async () => {
    const registry = createRegistry();
    const first = alpha.define("app.first", () => "first");
    const duplicate = alpha.define("app.first", () => "duplicate");
    const foreign = beta.define("app.foreign", () => "foreign");

    await expect(
      registry.registerBatch([first, duplicate]),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError);
    await expect(
      registry.registerBatch([first, foreign]),
    ).rejects.toBeInstanceOf(RegistrationKindError);
    expect(registry.resolve(first.id)).toBeUndefined();

    const active = registry.register(first);
    await expect(registry.registerBatch([duplicate])).rejects.toBeInstanceOf(
      DuplicateRegistrationError,
    );
    expect(registry.resolve(first.id)).toBe(active);
  });

  it("rolls initialized registrations back in reverse order", async () => {
    const registry = createRegistry();
    const first = alpha.define("app.first", () => "first");
    const second = alpha.define("app.second", () => "second");
    const calls: string[] = [];
    const cleanupFailure = new Error("second cleanup failed");
    const initializationFailure = new Error("initialization failed");
    const temporary: Registration[] = [];

    const batch = registry.registerBatch(
      [first, second],
      ({ definition, registration, addCleanup }) => {
        temporary.push(registration);
        addCleanup(() => {
          calls.push(definition.localSlug);
          if (definition === second) {
            throw cleanupFailure;
          }
        });
        if (definition === second) {
          throw initializationFailure;
        }
      },
    );

    await expect(batch).rejects.toMatchObject({
      cause: initializationFailure,
      cleanupFailures: [cleanupFailure],
    });
    await expect(batch).rejects.toBeInstanceOf(RegistrationBatchError);
    expect(calls).toEqual(["app.second", "app.first"]);
    expect(temporary.map(({ status }) => status)).toEqual([
      "released",
      "released",
    ]);
    expect(registry.resolve(first.id)).toBeUndefined();
    expect(registry.resolve(second.id)).toBeUndefined();
    expect(registry.register(first).revision).toBe(1);
  });

  it("revalidates conflicts immediately before publication", async () => {
    const registry = createRegistry();
    const first = alpha.define("app.first", () => "first");
    const second = alpha.define("app.second", () => "second");
    let injected = false;

    await expect(
      registry.registerBatch([first, second], () => {
        if (!injected) {
          injected = true;
          registry.register(second);
        }
      }),
    ).rejects.toBeInstanceOf(RegistrationBatchError);

    expect(registry.resolve(first.id)).toBeUndefined();
    expect(registry.resolve(second.id)?.definition).toBe(second);
  });

  it("rolls back when an initializer advances the registry revision", async () => {
    const registry = createRegistry();
    const staged = alpha.define("app.staged", () => "staged");
    const unrelated = alpha.define("other.active", () => "active");
    let injected = false;

    await expect(
      registry.registerBatch([staged], () => {
        if (!injected) {
          injected = true;
          registry.register(unrelated);
        }
      }),
    ).rejects.toBeInstanceOf(RegistrationBatchError);

    expect(registry.resolve(staged.id)).toBeUndefined();
    expect(registry.resolve(unrelated.id)?.revision).toBe(1);
    expect(
      registry.register(alpha.define("other.next", () => "next")).revision,
    ).toBe(2);
  });
});
