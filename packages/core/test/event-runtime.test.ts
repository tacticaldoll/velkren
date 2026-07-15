import { describe, expect, it } from "vitest";

import {
  createEventClass,
  eventField,
  type EventClass,
} from "../src/event-class.js";
import {
  createEventLoader,
  createEventRuntime,
  DuplicateEventRuntimeError,
} from "../src/event-runtime.js";
import { RegistrationDependencyError } from "../src/registration-errors.js";
import { OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";

const saved = createEventClass("editor.saved", {
  path: eventField((value) => typeof value === "string"),
});

describe("public semantic EventRuntime facade", () => {
  it("composes exactly once without exposing generic registration controls", async () => {
    const runtime = createRuntime({ id: "app" });
    const events = createEventRuntime(runtime);
    const registration = events.register(saved);

    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(events.factory)).toBe(true);
    expect(events.factory).not.toHaveProperty("allocateDiagnosticId");
    expect(registration.eventClass).toBe(saved);
    expect(runtime.owns(registration)).toBe(true);
    expect(registration).not.toHaveProperty("definition");
    expect(registration).not.toHaveProperty("release");
    expect(Object.isFrozen(registration)).toBe(true);
    expect(events.resolve(saved.id)).toBe(registration);
    expect(() => createEventRuntime(runtime)).toThrow(
      DuplicateEventRuntimeError,
    );

    const event = await events.create(registration, { path: "a" });
    await expect(events.unregister(saved.id)).rejects.toBeInstanceOf(
      RegistrationDependencyError,
    );
    await event.release();
    await events.unregister(saved.id);
    expect(registration.status).toBe("released");
  });

  it("isolates equal runtime IDs and reusable EventClass definitions", async () => {
    const first = createEventRuntime(createRuntime({ id: "same" }));
    const second = createEventRuntime(createRuntime({ id: "same" }));
    const firstRegistration = first.register(saved);
    const secondRegistration = second.register(saved);

    expect(firstRegistration).not.toBe(secondRegistration);
    await expect(
      second.create(firstRegistration, { path: "foreign" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect((await first.create(saved.id, { path: "first" })).classId).toBe(
      saved.id,
    );
    expect((await second.create(saved.id, { path: "second" })).classId).toBe(
      saved.id,
    );
  });

  it("resolves active classes before invoking a loader", async () => {
    const events = createEventRuntime(createRuntime({ id: "active" }));
    let calls = 0;
    events.registerLoader(
      createEventLoader("editor", () => {
        calls += 1;
        return [saved];
      }),
    );
    const active = events.register(saved);

    await expect(events.load(saved.id)).resolves.toBe(active);
    expect(calls).toBe(0);
  });

  it("loads EventClass-only contributions atomically", async () => {
    const events = createEventRuntime(createRuntime({ id: "load" }));
    const related = createEventClass("editor.related", {
      path: eventField((value) => typeof value === "string"),
    });
    const loader = createEventLoader("editor", () => [saved, related]);
    const loaderRegistration = events.registerLoader(loader);

    expect(loaderRegistration).not.toHaveProperty("definition");
    expect(loaderRegistration).not.toHaveProperty("release");
    expect(Object.isFrozen(loaderRegistration)).toBe(true);
    expect(loaderRegistration.namespace).toBe("editor");
    await expect(events.load(saved.id)).resolves.toMatchObject({
      eventClass: saved,
    });
    expect(events.resolve(related.id)?.eventClass).toBe(related);
  });

  it("rejects an invalid loader batch without partial publication", async () => {
    const events = createEventRuntime(createRuntime({ id: "invalid" }));
    const forged = Object.freeze({ ...saved }) as EventClass;
    events.registerLoader(createEventLoader("editor", () => [saved, forged]));

    await expect(events.load(saved.id)).rejects.toThrow();
    expect(events.resolve(saved.id)).toBeUndefined();
  });

  it("preserves the bounded contribution limit through the event adapter", async () => {
    const events = createEventRuntime(createRuntime({ id: "bounded" }));
    const many = Array.from({ length: 101 }, (_, index) =>
      createEventClass(`bulk.item-${index}`, {
        value: eventField((candidate) => typeof candidate === "number"),
      }),
    );
    events.registerLoader(createEventLoader("bulk", () => many));

    await expect(events.load(many[0]!.id)).rejects.toThrow();
    expect(events.resolve(many[0]!.id)).toBeUndefined();
    expect(events.resolve(many[99]!.id)).toBeUndefined();
  });

  it("reuses one loader definition across isolated runtimes", async () => {
    const loader = createEventLoader(undefined, () => [saved]);
    const first = createEventRuntime(createRuntime({ id: "one" }));
    const second = createEventRuntime(createRuntime({ id: "two" }));
    first.registerLoader(loader);
    second.registerLoader(loader);

    expect((await first.load(saved.id)).eventClass).toBe(saved);
    expect((await second.load(saved.id)).eventClass).toBe(saved);
  });
});
