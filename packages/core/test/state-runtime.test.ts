import { describe, expect, it } from "vitest";

import { createRuntime } from "../src/runtime.js";
import {
  createStateRuntime,
  DuplicateStateRuntimeError,
  InvalidStateValueError,
} from "../src/state-runtime.js";
import { ManagedStatus } from "../src/managed-lifecycle.js";

describe("managed-state domain", () => {
  it("rejects a second state domain on the same runtime", () => {
    const runtime = createRuntime({ id: "state" });
    createStateRuntime(runtime);
    expect(() => createStateRuntime(runtime)).toThrow(
      DuplicateStateRuntimeError,
    );
  });

  it("mints a runtime-owned, active managed handle", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ value: "a" });
    expect(runtime.owns(handle)).toBe(true);
    expect(handle.status).toBe(ManagedStatus.Active);
  });

  it("reads back the frozen initial value", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ value: "a", n: 1 });
    expect(handle.read()).toEqual({ value: "a", n: 1 });
    expect(Object.isFrozen(handle.read())).toBe(true);
  });

  it("stores a new value and notifies observers on update", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ value: "a" });
    const seen: unknown[] = [];
    handle.observe((v) => seen.push(v));
    const returned = handle.update({ value: "b" });
    expect(handle.read()).toEqual({ value: "b" });
    expect(returned).toEqual({ value: "b" });
    expect(seen).toEqual([{ value: "b" }]);
  });

  it("passes the current value to an updater function", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ n: 1 });
    const seen: number[] = [];
    handle.update((previous) => {
      seen.push(previous.n);
      return { n: previous.n + 1 };
    });
    expect(seen).toEqual([1]);
    expect(handle.read()).toEqual({ n: 2 });
  });

  it("rejects a non-JSON update without changing the value or notifying", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ value: "a" });
    let notified = 0;
    handle.observe(() => (notified += 1));
    expect(() => handle.update(() => ({ bad: () => 1 }) as never)).toThrow(
      InvalidStateValueError,
    );
    expect(handle.read()).toEqual({ value: "a" });
    expect(notified).toBe(0);
  });

  it("stops notifying a removed observer without affecting others", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ n: 0 });
    let kept = 0;
    let removed = 0;
    handle.observe(() => (kept += 1));
    const sub = handle.observe(() => (removed += 1));
    handle.update({ n: 1 });
    sub.remove();
    handle.update({ n: 2 });
    expect([kept, removed]).toEqual([2, 1]);
  });

  it("does not notify on subscribe by itself", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ n: 0 });
    let notified = 0;
    handle.observe(() => (notified += 1));
    expect(notified).toBe(0);
  });

  it("updates state and notifies the rest even when one observer throws", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ n: 0 });
    let after = 0;
    handle.observe(() => {
      throw new Error("boom");
    });
    handle.observe(() => (after += 1));
    expect(() => handle.update({ n: 1 })).toThrow(AggregateError);
    // The value was stored before notification, and the later observer still ran.
    expect(handle.read()).toEqual({ n: 1 });
    expect(after).toBe(1);
  });

  it("clears observers and fails active-only after release", async () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    const handle = state.create({ n: 0 });
    let notified = 0;
    handle.observe(() => (notified += 1));
    await handle.release();
    expect(handle.status).toBe(ManagedStatus.Released);
    expect(() => handle.read()).toThrow();
    expect(() => handle.update({ n: 1 })).toThrow();
    expect(() => handle.observe(() => undefined)).toThrow();
    expect(notified).toBe(0);
    // Idempotent release performs no further cleanup and does not throw.
    await expect(handle.release()).resolves.toBeUndefined();
  });

  it("rejects a non-JSON initial value without minting a handle", () => {
    const runtime = createRuntime({ id: "state" });
    const state = createStateRuntime(runtime);
    expect(() => state.create({ bad: () => 1 } as never)).toThrow(
      InvalidStateValueError,
    );
  });
});
