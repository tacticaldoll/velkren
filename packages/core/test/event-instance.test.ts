import { describe, expect, it } from "vitest";

import { createEventClass, eventField } from "../src/event-class.js";
import {
  EventFactoryKernel,
  EventPhase,
  getEventSnapshotText,
  setEventPhase,
  type EventClassRegistration,
  type EventRegistrationStore,
} from "../src/event-instance.js";
import { createQualifiedRegistrationId } from "../src/identity.js";
import { createManagedResource } from "../src/managed-lifecycle.js";
import { MissingRegistrationError } from "../src/registration-errors.js";
import { LifecycleError, OwnershipError } from "../src/runtime-errors.js";
import { createRuntime, type Runtime } from "../src/runtime.js";

function createHarness(id = "test") {
  const runtime = createRuntime({ id });
  const active = new Set<EventClassRegistration>();
  const dependencies = new Map<EventClassRegistration, number>();
  const store: EventRegistrationStore = {
    retain(registration) {
      runtime.assertOwns(registration);
      if (!active.has(registration)) {
        throw new MissingRegistrationError(registration.classId);
      }
      dependencies.set(registration, (dependencies.get(registration) ?? 0) + 1);
    },
    releaseDependent(registration) {
      const count = dependencies.get(registration) ?? 0;
      if (count === 0) throw new Error("dependent count underflow");
      dependencies.set(registration, count - 1);
    },
  };
  const factory = new EventFactoryKernel(runtime, store);
  return {
    active,
    dependencies,
    factory,
    runtime,
    register(eventClass = savedEvent, owner: Runtime = runtime) {
      const controller = createManagedResource(
        owner,
        createQualifiedRegistrationId(owner.id, eventClass.id),
        eventClass.id,
      );
      const registration = controller.object as EventClassRegistration &
        typeof controller.object;
      Object.defineProperty(registration, "eventClass", {
        enumerable: true,
        get() {
          registration.assertActive("read its EventClass");
          return eventClass;
        },
      });
      active.add(registration);
      return registration;
    },
  };
}

const savedEvent = createEventClass("editor.saved", {
  path: eventField((value) => typeof value === "string"),
});

describe("managed EventInstance and EventFactory", () => {
  it("creates an owned event with detached active-only data", async () => {
    const harness = createHarness();
    const registration = harness.register();
    const payload = { path: "first.txt" };
    const raw = { host: true };

    const event = await harness.factory.create(registration, payload, { raw });
    payload.path = "changed.txt";

    expect(event.id).toBe("test::event-instance/event-1");
    expect(event.classId).toBe(savedEvent.id);
    expect(event.phase).toBe(EventPhase.Created);
    expect(event.raw).toBe(raw);
    expect(event.snapshot).toEqual({ path: "first.txt" });
    expect(getEventSnapshotText(event)).toBe('{"path":"first.txt"}');
    expect(harness.runtime.owns(event)).toBe(true);
    expect(harness.dependencies.get(registration)).toBe(1);

    setEventPhase(event, EventPhase.Completed);
    expect(event.phase).toBe(EventPhase.Completed);
    await event.release();
    await event.release();
    expect(harness.dependencies.get(registration)).toBe(0);
    expect(event.tombstone).toMatchObject({
      classId: savedEvent.id,
      id: "test::event-instance/event-1",
      status: "released",
    });
    expect(() => event.phase).toThrow(LifecycleError);
    expect(() => event.raw).toThrow(LifecycleError);
    expect(() => event.snapshot).toThrow(LifecycleError);
    expect(() => getEventSnapshotText(event)).toThrow(LifecycleError);
  });

  it("rejects foreign, missing, and released registrations before payload traversal", async () => {
    const first = createHarness("first");
    const second = createHarness("second");
    const registration = first.register();
    let payloadReads = 0;
    const payload = Object.defineProperty({}, "path", {
      enumerable: true,
      get() {
        payloadReads += 1;
        return "unsafe";
      },
    });

    await expect(
      second.factory.create(registration, payload),
    ).rejects.toBeInstanceOf(OwnershipError);
    first.active.delete(registration);
    await expect(
      first.factory.create(registration, payload),
    ).rejects.toBeInstanceOf(MissingRegistrationError);
    first.active.add(registration);
    const valid = await first.factory.create(registration, { path: "safe" });
    expect(valid.id).toBe("first::event-instance/event-1");
    await valid.release();
    await registration.release();
    await expect(
      first.factory.create(registration, payload),
    ).rejects.toBeInstanceOf(LifecycleError);
    expect(payloadReads).toBe(0);
  });

  it("rolls validation failure back without publishing a dependent", async () => {
    const harness = createHarness();
    const registration = harness.register();

    const failure = await harness.factory
      .create(registration, { path: 42 })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      classId: savedEvent.id,
      cleanupFailures: [],
    });
    expect(harness.dependencies.get(registration)).toBe(0);
  });

  it("adopts a diagnostic ID allocated before managed creation", async () => {
    const harness = createHarness();
    const registration = harness.register();
    const diagnosticId = harness.factory.allocateDiagnosticId();

    const event = await harness.factory.create(
      registration,
      { path: "a" },
      {},
      diagnosticId,
    );

    expect(event.id).toBe(diagnosticId);
    await event.release();
  });

  it("preserves validation and pre-allocation rollback failures", async () => {
    const harness = createHarness();
    const registration = harness.register();
    const originalRelease = harness.dependencies;
    originalRelease.set(registration, -1);

    const failure = await harness.factory
      .create(registration, { path: 42 })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      cleanupFailures: [
        expect.objectContaining({ message: "dependent count underflow" }),
      ],
    });
  });

  it("preserves cleanup failure while still releasing the event", async () => {
    const harness = createHarness();
    const registration = harness.register();
    const event = await harness.factory.create(registration, { path: "a" });
    harness.dependencies.set(registration, 0);

    await expect(event.release()).rejects.toMatchObject({
      failures: [
        expect.objectContaining({ message: "dependent count underflow" }),
      ],
    });
    expect(event.status).toBe("released");
    expect(() => event.snapshot).toThrow(LifecycleError);
  });
});
