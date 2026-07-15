import { describe, expect, it } from "vitest";

import { OwnershipError, createRuntime } from "../src/index.js";
import {
  createCanonicalClassId,
  createManagedInstanceId,
} from "../src/identity.js";
import { createManagedObject } from "../src/managed-lifecycle.js";

function createTestObject(runtime: ReturnType<typeof createRuntime>) {
  return createManagedObject(
    runtime,
    createManagedInstanceId(runtime.id, "alpha", "test-1"),
    createCanonicalClassId("alpha", "sample.item"),
  ).object;
}

describe("runtime ownership", () => {
  it("creates readable explicit and generated runtime IDs", () => {
    expect(createRuntime({ id: "admin" }).id).toBe("admin");
    expect(createRuntime().id).toMatch(/^runtime-[0-9]+$/);
  });

  it("keeps ownership distinct when readable IDs are equal", () => {
    const first = createRuntime({ id: "shared" });
    const second = createRuntime({ id: "shared" });
    const object = createTestObject(first);

    expect(first.owns(object)).toBe(true);
    expect(() => first.assertOwns(object)).not.toThrow();
    expect(second.owns(object)).toBe(false);
    expect(() => second.assertOwns(object)).toThrow(OwnershipError);
    expect(object.status).toBe("active");
  });

  it("rejects unowned objects without mutating them", () => {
    const runtime = createRuntime({ id: "admin" });
    const unowned = { unchanged: true };

    expect(() => runtime.assertOwns(unowned)).toThrow(OwnershipError);
    expect(unowned).toEqual({ unchanged: true });
  });
});
