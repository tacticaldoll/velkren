import { describe, expect, it } from "vitest";

import { ManagedStatus } from "../src/managed-lifecycle.js";
import {
  InvalidReferenceCapabilityError,
  assertPrivateReferenceCapability,
  assertReferenceCapability,
  createReferenceCapability,
  resolveReferenceCapability,
  type ReferenceCapabilityIdentity,
} from "../src/reference-capability.js";
import {
  LifecycleError,
  ManagedReleaseError,
  OwnershipError,
} from "../src/runtime-errors.js";
import { createRuntime, markRuntimeOwned } from "../src/runtime.js";

function identity(localId = "cap-1"): ReferenceCapabilityIdentity {
  return { kind: "reference", localSlug: "capability", localId };
}

describe("reference capability provenance", () => {
  it("recognizes an issued capability and rejects impostors by the right error", () => {
    const runtime = createRuntime({ id: "app" });
    const { reference } = createReferenceCapability(
      runtime,
      { secret: 1 },
      identity(),
    );

    expect(runtime.owns(reference)).toBe(true);
    expect(() => assertReferenceCapability(runtime, reference)).not.toThrow();

    // Unowned object fails ownership before provenance.
    const unowned = Object.freeze({ ...reference });
    expect(() =>
      assertReferenceCapability(runtime, unowned as typeof reference),
    ).toThrow(OwnershipError);

    // Runtime-owned but never issued as a capability fails on provenance.
    const ownedNonCapability = markRuntimeOwned(runtime, {
      id: reference.id,
      classId: reference.classId,
      status: reference.status,
      tombstone: reference.tombstone,
      assertActive() {},
    });
    expect(() =>
      assertReferenceCapability(
        runtime,
        ownedNonCapability as unknown as typeof reference,
      ),
    ).toThrow(InvalidReferenceCapabilityError);
  });

  it("derives the readable instance id from the owning runtime", () => {
    const runtime = createRuntime({ id: "app" });
    const { reference } = createReferenceCapability(
      runtime,
      { value: 1 },
      identity("diag"),
    );

    expect(reference.id).toBe("app::reference-instance/diag");
    expect(reference.classId).toBe("reference/capability");
  });
});

describe("owner-validated resolution", () => {
  it("resolves for the owning runtime and denies foreign runtimes", () => {
    const owner = createRuntime({ id: "owner" });
    const other = createRuntime({ id: "other" });
    const target = { value: "guarded" };
    const { reference, handle } = createReferenceCapability(
      owner,
      target,
      identity(),
    );

    expect(resolveReferenceCapability(owner, reference)).toBe(target);
    expect(() => resolveReferenceCapability(other, reference)).toThrow(
      OwnershipError,
    );
    // The private path applies the same ownership check.
    expect(() => assertPrivateReferenceCapability(other, handle)).toThrow(
      OwnershipError,
    );
  });
});

describe("public/private handle split", () => {
  it("controls only through the private handle and leaks no private authority", async () => {
    const runtime = createRuntime({ id: "app" });
    const { reference, handle } = createReferenceCapability(
      runtime,
      { value: 1 },
      identity(),
    );

    // The public surface is exactly the diagnostic/use fields — no path to the
    // target, the private handle, or release, via own props or the prototype.
    expect(Object.getOwnPropertyNames(reference).sort()).toEqual(
      ["assertActive", "classId", "id", "status", "tombstone"].sort(),
    );
    // The only own symbol is the ownership brand; no symbol carries reachable
    // authority (an object or function that could reach the handle/target).
    const ref = reference as unknown as Record<PropertyKey, unknown>;
    for (const sym of Object.getOwnPropertySymbols(reference)) {
      expect(typeof ref[sym]).not.toBe("object");
      expect(typeof ref[sym]).not.toBe("function");
    }
    expect(Object.getPrototypeOf(reference)).toBe(Object.prototype);
    expect(Object.isFrozen(reference)).toBe(true);
    expect(assertPrivateReferenceCapability(runtime, handle)).toBe(reference);

    await handle.release();
    expect(reference.status).toBe(ManagedStatus.Released);
  });
});

describe("readable diagnostic identity", () => {
  it("exposes a readable identity that grants no operation and a surviving tombstone", async () => {
    const runtime = createRuntime({ id: "app" });
    const { reference, handle } = createReferenceCapability(
      runtime,
      { value: 1 },
      identity("diag"),
    );

    expect(typeof reference.id).toBe("string");
    expect(typeof reference.classId).toBe("string");

    await handle.release();
    expect(reference.tombstone).toMatchObject({
      id: "app::reference-instance/diag",
      status: ManagedStatus.Released,
    });
  });
});

describe("deterministic release through the managed lifecycle", () => {
  it("rejects use after release", async () => {
    const runtime = createRuntime({ id: "app" });
    const { reference, handle } = createReferenceCapability(
      runtime,
      { value: 1 },
      identity(),
    );

    await handle.release();
    expect(() => resolveReferenceCapability(runtime, reference)).toThrow(
      LifecycleError,
    );
  });

  it("runs cleanup once across repeated successful release", async () => {
    const runtime = createRuntime({ id: "app" });
    const { handle } = createReferenceCapability(
      runtime,
      { value: 1 },
      identity(),
    );
    let cleanups = 0;
    handle.addCleanup(() => {
      cleanups += 1;
    });

    await handle.release();
    await handle.release();
    expect(cleanups).toBe(1);
  });

  it("keeps a failed-release failure observable on later requests", async () => {
    const runtime = createRuntime({ id: "app" });
    const { handle } = createReferenceCapability(
      runtime,
      { value: 1 },
      identity(),
    );
    handle.addCleanup(() => {
      throw new Error("cleanup boom");
    });

    await expect(handle.release()).rejects.toBeInstanceOf(ManagedReleaseError);
    await expect(handle.release()).rejects.toBeInstanceOf(ManagedReleaseError);
  });
});

describe("cross-runtime isolation", () => {
  it("keeps same-class capabilities and their release isolated", async () => {
    const first = createRuntime({ id: "first" });
    const second = createRuntime({ id: "second" });
    const a = createReferenceCapability(first, { r: "a" }, identity());
    const b = createReferenceCapability(second, { r: "b" }, identity());

    expect(a.reference.classId).toBe(b.reference.classId);
    expect(() => resolveReferenceCapability(second, a.reference)).toThrow(
      OwnershipError,
    );
    expect(() => resolveReferenceCapability(first, b.reference)).toThrow(
      OwnershipError,
    );

    await a.handle.release();
    expect(a.reference.status).toBe(ManagedStatus.Released);
    expect(resolveReferenceCapability(second, b.reference)).toEqual({ r: "b" });
  });
});
