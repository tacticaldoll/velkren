import { describe, expect, it } from "vitest";

import { createEventClass, eventField } from "../src/event-class.js";
import { EventDispatchError, EventDispatcher } from "../src/event-dispatch.js";
import {
  EventFactoryKernel,
  type EventClassRegistration,
  type EventRegistrationStore,
} from "../src/event-instance.js";
import { createQualifiedRegistrationId } from "../src/identity.js";
import { createManagedResource } from "../src/managed-lifecycle.js";
import { MissingRegistrationError } from "../src/registration-errors.js";
import { createRuntime } from "../src/runtime.js";
import { safeEventTraceOutcome } from "../src/event-trace.js";

const saved = createEventClass("editor.saved", {
  path: eventField((value) => typeof value === "string"),
});

function createHarness(
  sink?: ConstructorParameters<typeof EventDispatcher>[2],
  failRelease = false,
) {
  const runtime = createRuntime({ id: "trace" });
  let dependents = 0;
  const store: EventRegistrationStore = {
    retain() {
      dependents += 1;
    },
    releaseDependent() {
      dependents -= 1;
      if (failRelease) throw new Error("release failed");
    },
  };
  const controller = createManagedResource(
    runtime,
    createQualifiedRegistrationId(runtime.id, saved.id),
    saved.id,
  );
  const registration = controller.object as EventClassRegistration;
  Object.defineProperty(registration, "eventClass", {
    enumerable: true,
    get: () => saved,
  });
  const factory = new EventFactoryKernel(runtime, store);
  const dispatcher = new EventDispatcher(
    factory,
    (classId) => {
      if (classId !== saved.id) throw new MissingRegistrationError(classId);
      return registration;
    },
    sink,
  );
  return { dispatcher, getDependents: () => dependents };
}

async function captureDispatchError(
  operation: Promise<unknown>,
): Promise<EventDispatchError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof EventDispatchError) return error;
    throw error;
  }
  throw new Error("Expected event dispatch to fail.");
}

describe("semantic event tracing and dispatch", () => {
  it("returns a deeply immutable detached success transcript", async () => {
    const seen: string[] = [];
    const payload = { path: "first.txt" };
    const { dispatcher, getDependents } = createHarness(async (record) => {
      await Promise.resolve();
      seen.push(record.phase);
    });

    const transcript = await dispatcher.dispatch(saved.id, payload);
    payload.path = "changed.txt";

    expect(transcript.map(({ phase }) => phase)).toEqual([
      "created",
      "completed",
      "released",
    ]);
    expect(seen).toEqual(["created", "completed", "released"]);
    expect(transcript.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
    expect(transcript[0]?.snapshot).toEqual({ path: "first.txt" });
    expect(transcript[1]?.snapshot).not.toBe(transcript[0]?.snapshot);
    expect(transcript[2]).not.toHaveProperty("snapshot");
    expect(Object.isFrozen(transcript)).toBe(true);
    expect(Object.isFrozen(transcript[0]?.snapshot)).toBe(true);
    expect(getDependents()).toBe(0);

    const next = await dispatcher.dispatch(saved.id, { path: "second.txt" });
    expect(next.map(({ sequence }) => sequence)).toEqual([4, 5, 6]);
  });

  it("traces a pre-instance failure without fabricating release", async () => {
    const { dispatcher } = createHarness();
    const missing = "event/missing.item" as typeof saved.id;

    const failure = await captureDispatchError(
      dispatcher.dispatch(missing, {}),
    );

    expect(failure).toBeInstanceOf(EventDispatchError);
    expect(failure.primaryCause).toBeInstanceOf(MissingRegistrationError);
    expect(failure.transcript.map(({ phase }) => phase)).toEqual(["failed"]);
    expect(failure.transcript[0]?.eventId).toBe(
      "trace::event-instance/event-1",
    );
    expect(failure.transcript[0]?.outcome.classification).toBe(
      "MissingRegistrationError",
    );
    expect(failure.transcript[0]?.outcome.message).toContain("not active");
  });

  it("awaits sink calls serially and reports every sink failure after release", async () => {
    const calls: string[] = [];
    const { dispatcher, getDependents } = createHarness(async (record) => {
      calls.push(`start:${record.phase}`);
      await Promise.resolve();
      calls.push(`end:${record.phase}`);
      throw new Error(`sink:${record.phase}`);
    });

    const failure = await captureDispatchError(
      dispatcher.dispatch(saved.id, { path: "a" }),
    );

    expect(failure.traceFailures).toHaveLength(3);
    expect(failure.releaseFailures).toEqual([]);
    expect(failure.transcript.map(({ phase }) => phase)).toEqual([
      "created",
      "failed",
      "released",
    ]);
    expect(calls).toEqual([
      "start:created",
      "end:created",
      "start:failed",
      "end:failed",
      "start:released",
      "end:released",
    ]);
    expect(getDependents()).toBe(0);
  });

  it("aggregates trace and release failures in one dispatch error", async () => {
    const { dispatcher } = createHarness(() => {
      throw new Error("sink failed");
    }, true);

    const failure = await captureDispatchError(
      dispatcher.dispatch(saved.id, { path: "a" }),
    );

    expect(failure).toBeInstanceOf(EventDispatchError);
    expect(failure.traceFailures).toHaveLength(3);
    expect(failure.releaseFailures).toHaveLength(1);
    expect(failure.transcript.at(-1)?.phase).toBe("released");
    expect(failure.transcript.at(-1)?.outcome.message).toBe("release failed");
  });

  it("converts hostile diagnostic values without retaining or invoking getters", () => {
    let reads = 0;
    const cause = Object.defineProperty({}, "message", {
      get() {
        reads += 1;
        return "unsafe";
      },
    });
    const outcome = safeEventTraceOutcome(cause);

    expect(outcome).toEqual({
      classification: "UnknownError",
      message: "Event dispatch failed.",
    });
    expect(reads).toBe(0);
    expect(Object.isFrozen(outcome)).toBe(true);
  });
});
