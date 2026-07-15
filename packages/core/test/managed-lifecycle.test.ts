import { describe, expect, it } from "vitest";

import {
  LifecycleError,
  ManagedReleaseError,
  ManagedStatus,
  createRuntime,
} from "../src/index.js";
import {
  createCanonicalClassId,
  createManagedInstanceId,
} from "../src/identity.js";
import { createManagedObject } from "../src/managed-lifecycle.js";

function createTestController() {
  const runtime = createRuntime({ id: "test" });
  return createManagedObject(
    runtime,
    createManagedInstanceId(runtime.id, "alpha", "managed-1"),
    createCanonicalClassId("alpha", "sample.item"),
  );
}

describe("managed lifecycle", () => {
  it("cleans resources in reverse order and releases once", async () => {
    const controller = createTestController();
    const calls: string[] = [];
    controller.addCleanup(() => calls.push("first"));
    controller.addCleanup(async () => {
      await Promise.resolve();
      calls.push("second");
    });

    const firstRelease = controller.object.release();
    const repeatedRelease = controller.object.release();
    expect(firstRelease).toBe(repeatedRelease);
    await firstRelease;
    await repeatedRelease;

    expect(calls).toEqual(["second", "first"]);
    expect(controller.object.status).toBe(ManagedStatus.Released);
    expect(controller.object.tombstone).toEqual(
      expect.objectContaining({
        id: controller.object.id,
        classId: controller.object.classId,
        status: ManagedStatus.Released,
        releaseFailed: false,
      }),
    );
    expect(Object.isFrozen(controller.object.tombstone)).toBe(true);
  });

  it("attempts all cleanup and preserves one release failure", async () => {
    const controller = createTestController();
    const calls: string[] = [];
    const firstFailure = new Error("first cleanup failed");
    const secondFailure = new Error("second cleanup failed");
    controller.addCleanup(() => {
      calls.push("first");
      throw firstFailure;
    });
    controller.addCleanup(() => {
      calls.push("second");
      throw secondFailure;
    });

    const firstRelease = controller.object.release();
    await expect(firstRelease).rejects.toMatchObject({
      failures: [secondFailure, firstFailure],
    });
    expect(calls).toEqual(["second", "first"]);
    expect(controller.object.status).toBe(ManagedStatus.Released);
    expect(controller.object.tombstone?.releaseFailed).toBe(true);

    const repeatedRelease = controller.object.release();
    expect(repeatedRelease).toBe(firstRelease);
    await expect(repeatedRelease).rejects.toBeInstanceOf(ManagedReleaseError);
    expect(calls).toEqual(["second", "first"]);
  });

  it("rejects active operations after release", async () => {
    const controller = createTestController();
    await controller.object.release();

    expect(() => controller.object.assertActive("update state")).toThrow(
      LifecycleError,
    );
    expect(() => controller.addCleanup(() => undefined)).toThrow(
      LifecycleError,
    );
  });

  it("reports disposing status while asynchronous cleanup is active", async () => {
    const controller = createTestController();
    let finishCleanup: (() => void) | undefined;
    controller.addCleanup(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );

    const release = controller.object.release();

    expect(() => controller.object.assertActive("update state")).toThrow(
      expect.objectContaining({ status: ManagedStatus.Disposing }),
    );
    finishCleanup?.();
    await release;
  });
});
