import { describe, expect, it } from "vitest";

import { createEventClass, eventField } from "../src/event-class.js";
import {
  EventChannel,
  ListenerLifecyclePhase,
  createEventEndpoint,
} from "../src/event-endpoint.js";
import { createListenerClass } from "../src/listener-class.js";
import {
  ListenerCreationError,
  ListenerRegistry,
  createListenerFactory,
  readActiveListenerContext,
} from "../src/listener-runtime.js";
import { RegistrationDependencyError } from "../src/registration-errors.js";
import { LifecycleError, OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";

const eventClass = createEventClass("editor.saved", {
  path: eventField((value) => typeof value === "string"),
});
const listenerClass = createListenerClass(
  "editor.audit",
  eventClass,
  () => undefined,
);

describe("listener registration and managed instances", () => {
  it("reuses portable definitions through isolated protected registrations", () => {
    const first = new ListenerRegistry(createRuntime({ id: "first" }));
    const second = new ListenerRegistry(createRuntime({ id: "second" }));
    const firstRegistration = first.register(listenerClass);
    const secondRegistration = second.register(listenerClass);

    expect(firstRegistration.listenerClass).toBe(listenerClass);
    expect(secondRegistration.listenerClass).toBe(listenerClass);
    expect(firstRegistration.id).toBe("first::listener/editor.audit");
    expect(secondRegistration.id).toBe("second::listener/editor.audit");
    expect(firstRegistration).not.toHaveProperty("definition");
    expect(firstRegistration).not.toHaveProperty("release");
    expect(Object.isFrozen(firstRegistration)).toBe(true);
  });

  it("rejects foreign registrations and endpoint authorities", async () => {
    const firstRuntime = createRuntime({ id: "first" });
    const secondRuntime = createRuntime({ id: "second" });
    const firstRegistry = new ListenerRegistry(firstRuntime);
    const secondRegistry = new ListenerRegistry(secondRuntime);
    const firstEndpoint = await createEventEndpoint(firstRuntime);
    const secondEndpoint = await createEventEndpoint(secondRuntime);
    const firstRegistration = firstRegistry.register(listenerClass);
    const secondRegistration = secondRegistry.register(listenerClass);
    const factory = createListenerFactory(firstRuntime, firstRegistry);

    await expect(
      factory.create(secondRegistration, firstEndpoint.endpoint),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      factory.create(firstRegistration, secondEndpoint.endpoint),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("installs public and private listeners in one monotonic endpoint order", async () => {
    const runtime = createRuntime({ id: "app" });
    const registry = new ListenerRegistry(runtime);
    const registration = registry.register(listenerClass);
    const pair = await createEventEndpoint(runtime);
    const factory = createListenerFactory(runtime, registry);

    const publicListener = await factory.create(registration, pair.endpoint);
    const privateListener = await factory.create(
      registration,
      pair.privateEndpoint,
    );

    expect(publicListener.installationSequence).toBe(1);
    expect(privateListener.installationSequence).toBe(2);
    expect(readActiveListenerContext(publicListener)).toMatchObject({
      endpoint: pair.endpoint,
      listenerClass,
      channel: EventChannel.Public,
    });
    expect(readActiveListenerContext(privateListener).channel).toBe(
      EventChannel.Private,
    );
  });

  it("retains registration dependencies until idempotent release", async () => {
    const runtime = createRuntime({ id: "app" });
    const registry = new ListenerRegistry(runtime);
    const registration = registry.register(listenerClass);
    const pair = await createEventEndpoint(runtime);
    const listener = await createListenerFactory(runtime, registry).create(
      registration,
      pair.endpoint,
    );

    await expect(registry.unregister(listenerClass.id)).rejects.toBeInstanceOf(
      RegistrationDependencyError,
    );
    const replacement = createListenerClass(
      "editor.audit",
      eventClass,
      () => undefined,
    );
    await expect(registry.replace(replacement)).rejects.toBeInstanceOf(
      RegistrationDependencyError,
    );
    expect(registry.resolve(listenerClass.id)).toBe(registration);
    await listener.release();
    await listener.release();
    expect(listener.status).toBe("released");
    expect(() => readActiveListenerContext(listener)).toThrow(LifecycleError);
    await expect(
      registry.unregister(listenerClass.id),
    ).resolves.toBeUndefined();
  });

  it("rolls back installation and retained dependency on observer failure", async () => {
    const runtime = createRuntime({ id: "app" });
    const registry = new ListenerRegistry(runtime);
    const registration = registry.register(listenerClass);
    const pair = await createEventEndpoint(runtime);
    const cause = new Error("installed observer failed");
    const factory = createListenerFactory(runtime, registry, (record) => {
      if (record.phase === ListenerLifecyclePhase.ListenerInstalled)
        throw cause;
    });

    const failure = await factory
      .create(registration, pair.endpoint)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ListenerCreationError);
    expect(failure).toMatchObject({ cause, cleanupFailures: [] });
    await expect(
      registry.unregister(listenerClass.id),
    ).resolves.toBeUndefined();
  });

  it("lets endpoint ownership release listeners in reverse installation order", async () => {
    const records: Array<{ phase: string; listenerId?: string }> = [];
    const runtime = createRuntime({ id: "app" });
    const registry = new ListenerRegistry(runtime);
    const firstClass = createListenerClass(
      "editor.first",
      eventClass,
      () => undefined,
    );
    const secondClass = createListenerClass(
      "editor.second",
      eventClass,
      () => undefined,
    );
    const pair = await createEventEndpoint(runtime);
    const factory = createListenerFactory(runtime, registry, (record) => {
      records.push(record);
    });
    const first = await factory.create(
      registry.register(firstClass),
      pair.endpoint,
    );
    const second = await factory.create(
      registry.register(secondClass),
      pair.endpoint,
    );

    await pair.privateEndpoint.release();

    expect(first.status).toBe("released");
    expect(second.status).toBe("released");
    expect(
      records
        .filter(
          (record) => record.phase === ListenerLifecyclePhase.ListenerReleased,
        )
        .map((record) => record.listenerId),
    ).toEqual([second.id, first.id]);
  });
});
