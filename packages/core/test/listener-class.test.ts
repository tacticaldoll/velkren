import { describe, expect, it } from "vitest";

import { createEventClass, eventField } from "../src/event-class.js";
import {
  ListenerDefinitionError,
  ListenerExecutionError,
  ListenerReturnContractError,
  createListenerClass,
  createListenerMiddleware,
  executeListener,
  isListenerClass,
  type ListenerContext,
} from "../src/listener-class.js";

const eventClass = createEventClass("editor.saved", {
  path: eventField((value) => typeof value === "string"),
});
const context = Object.freeze({}) as ListenerContext;

async function captureExecutionError(
  operation: Promise<unknown>,
): Promise<ListenerExecutionError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof ListenerExecutionError) return error;
    throw error;
  }
  throw new Error("Expected listener execution to fail.");
}

describe("ListenerClass and onion middleware", () => {
  it("creates immutable helper-proven definitions and copies middleware", () => {
    const middleware = [createListenerMiddleware({})];
    const listener = createListenerClass(
      "editor.audit",
      eventClass,
      () => undefined,
      middleware,
    );
    middleware.length = 0;

    expect(listener.id).toBe("listener/editor.audit");
    expect(listener.eventClass).toBe(eventClass);
    expect(listener.middleware).toHaveLength(1);
    expect(Object.isFrozen(listener)).toBe(true);
    expect(Object.isFrozen(listener.middleware)).toBe(true);
    expect(Object.isFrozen(listener.middleware[0])).toBe(true);
    expect(isListenerClass(listener)).toBe(true);
    expect(isListenerClass(Object.freeze({ ...listener }))).toBe(false);
  });

  it("rejects forged EventClass and middleware definitions", () => {
    expect(() =>
      createListenerClass(
        "editor.audit",
        Object.freeze({ ...eventClass }),
        () => undefined,
      ),
    ).toThrow(ListenerDefinitionError);
    expect(() =>
      createListenerClass("editor.audit", eventClass, () => undefined, [
        Object.freeze({}),
      ]),
    ).toThrow(ListenerDefinitionError);
  });

  it("rejects accessor middleware options without invoking them", () => {
    let reads = 0;
    const options = Object.defineProperty({}, "before", {
      enumerable: true,
      get() {
        reads += 1;
        return () => undefined;
      },
    });

    expect(() => createListenerMiddleware(options)).toThrow(
      ListenerDefinitionError,
    );
    expect(reads).toBe(0);
  });

  it("bounds middleware materialization", () => {
    const middleware = Array.from({ length: 101 }, () =>
      createListenerMiddleware({}),
    );
    expect(() =>
      createListenerClass(
        "editor.audit",
        eventClass,
        () => undefined,
        middleware,
      ),
    ).toThrow(ListenerDefinitionError);
  });

  it("executes successful middleware in onion order", async () => {
    const calls: string[] = [];
    const listener = createListenerClass(
      "editor.audit",
      eventClass,
      () => calls.push("callback") && undefined,
      [
        createListenerMiddleware({
          before: () => calls.push("before-one") && undefined,
          after: () => calls.push("after-one") && undefined,
        }),
        createListenerMiddleware({
          before: async () => {
            await Promise.resolve();
            calls.push("before-two");
          },
          after: async () => {
            await Promise.resolve();
            calls.push("after-two");
          },
        }),
      ],
    );

    await expect(executeListener(listener, context)).resolves.toBe(false);
    expect(calls).toEqual([
      "before-one",
      "before-two",
      "callback",
      "after-two",
      "after-one",
    ]);
  });

  it("unwinds entered middleware after a before short-circuit", async () => {
    const calls: string[] = [];
    const listener = createListenerClass(
      "editor.audit",
      eventClass,
      () => calls.push("callback") && undefined,
      [
        createListenerMiddleware({
          before: () => calls.push("before-one") && undefined,
          after: () => calls.push("after-one") && undefined,
        }),
        createListenerMiddleware({
          before: () => {
            calls.push("before-two");
            return false;
          },
          after: () => calls.push("after-two") && undefined,
        }),
        createListenerMiddleware({
          before: () => calls.push("never") && undefined,
        }),
      ],
    );

    await expect(executeListener(listener, context)).resolves.toBe(true);
    expect(calls).toEqual([
      "before-one",
      "before-two",
      "after-two",
      "after-one",
    ]);
  });

  it("accepts callback false and rejects truthy callback returns", async () => {
    const short = createListenerClass("editor.short", eventClass, () => false);
    const invalid = createListenerClass(
      "editor.invalid",
      eventClass,
      (() => true) as never,
    );

    await expect(executeListener(short, context)).resolves.toBe(true);
    const failure = await captureExecutionError(
      executeListener(invalid, context),
    );
    expect(failure.primaryCause).toBeInstanceOf(ListenerReturnContractError);
  });

  it("does not enter middleware whose before hook throws", async () => {
    const calls: string[] = [];
    const primary = new Error("before failed");
    const listener = createListenerClass(
      "editor.audit",
      eventClass,
      () => undefined,
      [
        createListenerMiddleware({
          after: () => calls.push("outer-after") && undefined,
        }),
        createListenerMiddleware({
          before: () => {
            throw primary;
          },
          after: () => calls.push("throwing-after") && undefined,
        }),
      ],
    );

    await expect(executeListener(listener, context)).rejects.toMatchObject({
      primaryCause: primary,
      afterFailures: [],
    });
    expect(calls).toEqual(["outer-after"]);
  });

  it("does not confuse thrown undefined with successful completion", async () => {
    let callbackCalls = 0;
    const listener = createListenerClass("editor.undefined", eventClass, () => {
      callbackCalls += 1;
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- JavaScript callers can throw any value.
      throw undefined;
    });

    const failure = await captureExecutionError(
      executeListener(listener, context),
    );
    expect(failure.primaryCause).toBeUndefined();
    expect(failure.afterFailures).toEqual([]);
    expect(callbackCalls).toBe(1);
  });

  it("preserves callback and every after failure while fully unwinding", async () => {
    const calls: string[] = [];
    const primary = new Error("callback failed");
    const inner = new Error("inner failed");
    const outer = new Error("outer failed");
    const listener = createListenerClass(
      "editor.audit",
      eventClass,
      () => {
        throw primary;
      },
      [
        createListenerMiddleware({
          after: () => {
            calls.push("outer");
            throw outer;
          },
        }),
        createListenerMiddleware({
          after: () => {
            calls.push("inner");
            throw inner;
          },
        }),
      ],
    );

    const failure = await executeListener(listener, context).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ListenerExecutionError);
    expect(failure).toMatchObject({
      primaryCause: primary,
      afterFailures: [inner, outer],
    });
    expect(calls).toEqual(["inner", "outer"]);
  });

  it("treats false from after as failure and continues unwinding", async () => {
    const calls: string[] = [];
    const listener = createListenerClass(
      "editor.audit",
      eventClass,
      () => undefined,
      [
        createListenerMiddleware({
          after: () => calls.push("outer") && undefined,
        }),
        createListenerMiddleware({
          after: (() => false) as never,
        }),
      ],
    );

    const failure = await captureExecutionError(
      executeListener(listener, context),
    );
    expect(failure.primaryCause).toBeUndefined();
    expect(failure.afterFailures).toHaveLength(1);
    expect(failure.afterFailures[0]).toBeInstanceOf(
      ListenerReturnContractError,
    );
    expect(calls).toEqual(["outer"]);
  });
});
