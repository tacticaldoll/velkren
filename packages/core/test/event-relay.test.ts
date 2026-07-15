import { describe, expect, it } from "vitest";

import { createEventClass, eventField } from "../src/event-class.js";
import { EventDispatchError } from "../src/event-dispatch.js";
import { createEventRuntime, RelayDepthError } from "../src/event-runtime.js";
import { OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";

const sourceClass = createEventClass("relay.source", {
  value: eventField((value) => typeof value === "string"),
});
const targetClass = createEventClass("relay.target", {
  value: eventField((value) => typeof value === "string"),
});

function createHarness(id = "relay") {
  const events = createEventRuntime(createRuntime({ id }));
  events.register(sourceClass);
  events.register(targetClass);
  return events;
}

function containsCause(root: unknown, expected: typeof Error): boolean {
  const seen = new Set<unknown>();
  const pending = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value instanceof expected) return true;
    if (typeof value !== "object" || value === null || seen.has(value))
      continue;
    seen.add(value);
    for (const key of ["cause", "primaryCause"]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) {
        pending.push(descriptor.value);
      }
    }
  }
  return false;
}

describe("managed semantic relayers", () => {
  it("maps a detached snapshot into an independent target event", async () => {
    const eventIds: string[] = [];
    const events = createEventRuntime(createRuntime({ id: "relay" }), {
      traceSink(record) {
        if (record.phase === "created") eventIds.push(record.eventId);
      },
    });
    events.register(sourceClass);
    events.register(targetClass);
    const source = await events.createEndpoint();
    const target = await events.createEndpoint();
    let sourceSnapshot: unknown;
    let mapperSnapshot: unknown;
    let targetSnapshot: unknown;
    await events.listen(
      events.registerListener(
        events.defineListener(
          "relay.capture-source",
          sourceClass,
          ({ event }) => {
            sourceSnapshot = event.snapshot;
          },
        ),
      ),
      source.endpoint,
    );
    const relayer = await events.relay(
      source.endpoint,
      sourceClass,
      target.privateEndpoint,
      targetClass.id,
      async (snapshot) => {
        await Promise.resolve();
        mapperSnapshot = snapshot;
        return { value: `${snapshot.value as string}-mapped` };
      },
    );
    await events.listen(
      events.registerListener(
        events.defineListener(
          "relay.capture-target",
          targetClass,
          ({ event }) => {
            targetSnapshot = event.snapshot;
          },
        ),
      ),
      target.privateEndpoint,
    );

    await events.publish(source.endpoint, sourceClass.id, { value: "source" });

    expect(relayer.status).toBe("active");
    expect(mapperSnapshot).toEqual({ value: "source" });
    expect(mapperSnapshot).not.toBe(sourceSnapshot);
    expect(targetSnapshot).toEqual({ value: "source-mapped" });
    expect(targetSnapshot).not.toBe(mapperSnapshot);
    expect(new Set(eventIds).size).toBe(2);
    const relayClassId = relayer.classId;
    await relayer.release();
    expect(events.resolveListener(relayClassId)).toBeUndefined();
  });

  it("rejects cross-runtime targets before mapping or installation", async () => {
    const first = createHarness("first");
    const second = createHarness("second");
    const firstEndpoint = await first.createEndpoint();
    const secondEndpoint = await second.createEndpoint();
    let mapperCalls = 0;

    await expect(
      first.relay(
        firstEndpoint.endpoint,
        sourceClass,
        secondEndpoint.endpoint,
        targetClass.id,
        () => {
          mapperCalls += 1;
          return { value: "unsafe" };
        },
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(mapperCalls).toBe(0);
  });

  it("reports mapper failure through dispatch and keeps finalization intact", async () => {
    const events = createHarness();
    const endpoint = await events.createEndpoint();
    const cause = new Error("mapper failed");
    const relayer = await events.relay(
      endpoint.endpoint,
      sourceClass,
      endpoint.endpoint,
      targetClass.id,
      () => {
        throw cause;
      },
    );

    const failure = await events
      .publish(endpoint.endpoint, sourceClass.id, { value: "source" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EventDispatchError);
    expect(failure).toMatchObject({ primaryCause: { primaryCause: cause } });
    await relayer.release();
    await expect(events.unregister(sourceClass.id)).resolves.toBeUndefined();
  });

  it("revalidates target activity before mapper execution", async () => {
    const events = createHarness();
    const source = await events.createEndpoint();
    const target = await events.createEndpoint();
    let mapperCalls = 0;
    const relayer = await events.relay(
      source.endpoint,
      sourceClass,
      target.endpoint,
      targetClass.id,
      () => {
        mapperCalls += 1;
        return { value: "unsafe" };
      },
    );
    await target.privateEndpoint.release();

    await expect(
      events.publish(source.endpoint, sourceClass.id, { value: "source" }),
    ).rejects.toBeInstanceOf(EventDispatchError);
    expect(mapperCalls).toBe(0);
    await relayer.release();
  });

  it("supports nested relays with fresh target publications", async () => {
    const finalClass = createEventClass("relay.final", {
      value: eventField((value) => typeof value === "string"),
    });
    const events = createHarness();
    events.register(finalClass);
    const endpoint = await events.createEndpoint();
    const observed: string[] = [];
    await events.relay(
      endpoint.endpoint,
      sourceClass,
      endpoint.endpoint,
      targetClass.id,
      (snapshot) => ({ value: `${snapshot.value as string}-target` }),
    );
    await events.relay(
      endpoint.endpoint,
      targetClass,
      endpoint.endpoint,
      finalClass.id,
      (snapshot) => ({ value: `${snapshot.value as string}-final` }),
    );
    await events.listen(
      events.registerListener(
        events.defineListener(
          "relay.final-listener",
          finalClass,
          ({ event }) => {
            observed.push(event.snapshot.value as string);
          },
        ),
      ),
      endpoint.endpoint,
    );

    await events.publish(endpoint.endpoint, sourceClass.id, { value: "start" });
    expect(observed).toEqual(["start-target-final"]);
  });

  it("bounds relay cycles and releases every nested event", async () => {
    const events = createHarness();
    const endpoint = await events.createEndpoint();
    const relayer = await events.relay(
      endpoint.endpoint,
      sourceClass,
      endpoint.endpoint,
      sourceClass.id,
      (snapshot) => snapshot,
    );

    const failure = await events
      .publish(endpoint.endpoint, sourceClass.id, { value: "cycle" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EventDispatchError);
    expect(containsCause(failure, RelayDepthError)).toBe(true);
    await relayer.release();
    await expect(events.unregister(sourceClass.id)).resolves.toBeUndefined();
  });
});
