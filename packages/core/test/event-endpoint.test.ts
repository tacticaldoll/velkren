import { describe, expect, it } from "vitest";

import {
  EventEndpointCreationError,
  ListenerLifecyclePhase,
  addEndpointCleanup,
  assertEventEndpoint,
  assertPrivateEventEndpoint,
  createDefaultEventEndpoint,
  createEventEndpoint,
  endpointPublicationCount,
  trackEndpointPublication,
} from "../src/event-endpoint.js";
import { LifecycleError, OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";

describe("managed EventEndpoint authority", () => {
  it("creates separate frozen public and private capabilities", async () => {
    const runtime = createRuntime({ id: "app" });
    const pair = await createEventEndpoint(runtime);

    expect(pair.endpoint.id).toBe("app::event-endpoint-instance/endpoint-1");
    expect(pair.privateEndpoint.endpoint).toBe(pair.endpoint);
    expect(Object.isFrozen(pair)).toBe(true);
    expect(Object.isFrozen(pair.endpoint)).toBe(true);
    expect(Object.isFrozen(pair.privateEndpoint)).toBe(true);
    expect(pair.endpoint).not.toHaveProperty("release");
    expect(runtime.owns(pair.endpoint)).toBe(true);
    expect(runtime.owns(pair.privateEndpoint)).toBe(true);
    expect(assertPrivateEventEndpoint(runtime, pair.privateEndpoint)).toBe(
      pair.endpoint,
    );
  });

  it("rejects foreign authority before endpoint behavior", async () => {
    const first = createRuntime({ id: "first" });
    const second = createRuntime({ id: "second" });
    const pair = await createEventEndpoint(first);

    expect(() => assertEventEndpoint(second, pair.endpoint)).toThrow(
      OwnershipError,
    );
    expect(() =>
      assertPrivateEventEndpoint(second, pair.privateEndpoint),
    ).toThrow(OwnershipError);
  });

  it("rejects structural endpoint imitations", async () => {
    const runtime = createRuntime({ id: "app" });
    const pair = await createEventEndpoint(runtime);
    const forged = Object.freeze({ ...pair.endpoint });

    expect(() => assertEventEndpoint(runtime, forged)).toThrow(OwnershipError);
  });

  it("tracks concurrent publications without making release wait", async () => {
    const runtime = createRuntime({ id: "app" });
    const pair = await createEventEndpoint(runtime);
    const finishFirst = trackEndpointPublication(pair.endpoint);
    const finishSecond = trackEndpointPublication(pair.endpoint);
    expect(endpointPublicationCount(pair.endpoint)).toBe(2);

    await pair.privateEndpoint.release();
    expect(pair.endpoint.status).toBe("released");
    expect(() => trackEndpointPublication(pair.endpoint)).toThrow(
      LifecycleError,
    );
    finishFirst();
    finishSecond();
    finishSecond();
    expect(endpointPublicationCount(pair.endpoint)).toBe(0);
    await pair.privateEndpoint.release();
  });

  it("releases owned cleanup in reverse order", async () => {
    const pair = await createEventEndpoint(createRuntime({ id: "app" }));
    const calls: string[] = [];
    addEndpointCleanup(pair.endpoint, () => calls.push("first"));
    addEndpointCleanup(pair.endpoint, () => calls.push("second"));

    await pair.privateEndpoint.release();
    expect(calls).toEqual(["second", "first"]);
  });

  it("emits immutable lifecycle records and ignores observer returns", async () => {
    const records: unknown[] = [];
    const pair = await createEventEndpoint(
      createRuntime({ id: "app" }),
      async (record) => {
        await Promise.resolve();
        records.push(record);
        return false;
      },
    );
    await pair.privateEndpoint.release();

    expect(records).toMatchObject([
      { phase: ListenerLifecyclePhase.EndpointCreated, sequence: 1 },
      { phase: ListenerLifecyclePhase.EndpointReleased, sequence: 2 },
    ]);
    expect(records.every(Object.isFrozen)).toBe(true);
  });

  it("rolls creation back before reporting observer failure", async () => {
    const cause = new Error("observer failed");
    const failure = await createEventEndpoint(
      createRuntime({ id: "app" }),
      (record) => {
        if (record.phase === ListenerLifecyclePhase.EndpointCreated)
          throw cause;
      },
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EventEndpointCreationError);
    expect(failure).toMatchObject({ cause, cleanupFailures: [] });
  });

  it("keeps the permanent default endpoint internal to lifecycle observation", () => {
    const pair = createDefaultEventEndpoint(createRuntime({ id: "app" }));
    expect(pair.endpoint.status).toBe("active");
  });
});
