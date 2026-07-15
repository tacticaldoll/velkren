import { describe, expect, it } from "vitest";

import {
  EventPayloadValidationError,
  EventSchemaError,
  createEventClass,
  eventField,
  isEventClass,
  optionalEventField,
  validateEventPayload,
  type EventField,
} from "../src/event-class.js";
import type { JsonObject } from "../src/strict-json.js";

const isString = eventField((value) => typeof value === "string");

describe("EventClass closed schema", () => {
  it("creates helper-proven immutable class and schema identity", () => {
    const mutableSchema: Record<string, EventField> = { message: isString };
    const eventClass = createEventClass("editor.saved", mutableSchema);
    mutableSchema.added = isString;

    expect(eventClass.id).toBe("event/editor.saved");
    expect(eventClass.localSlug).toBe("editor.saved");
    expect(isEventClass(eventClass)).toBe(true);
    expect(Object.isFrozen(eventClass)).toBe(true);
    expect(Object.isFrozen(eventClass.schema)).toBe(true);
    expect(Object.keys(eventClass.schema)).toEqual(["message"]);
    expect(Reflect.set(eventClass.schema, "added", isString)).toBe(false);
    expect(isEventClass({ ...eventClass })).toBe(false);
  });

  it("accepts valid required and optional fields in schema order", () => {
    const eventClass = createEventClass("editor.saved", {
      message: isString,
      detail: optionalEventField(
        (value) => value === null || typeof value === "object",
      ),
    });
    const snapshot = validateEventPayload(eventClass, {
      detail: { z: 2, a: 1 },
      message: "saved",
    });

    expect(snapshot.text).toBe('{"message":"saved","detail":{"a":1,"z":2}}');
    expect(validateEventPayload(eventClass, { message: "saved" }).text).toBe(
      '{"message":"saved"}',
    );
  });

  it("validates a detached frozen value rather than caller input", () => {
    const input = { nested: { value: "before" } };
    let validated: unknown;
    const eventClass = createEventClass("editor.changed", {
      nested: eventField((value) => {
        validated = value;
        return typeof value === "object";
      }),
    });

    const snapshot = validateEventPayload(eventClass, input);
    input.nested.value = "after";

    expect(validated).toBe(snapshot.value.nested);
    expect(validated).not.toBe(input.nested);
    expect(Object.isFrozen(validated)).toBe(true);
    expect((snapshot.value.nested as JsonObject).value).toBe("before");
  });

  it.each([
    ["missing", {}, "$.message"],
    ["unknown", { message: "value", other: true }, "$.other"],
    ["rejected", { message: 1 }, "$.message"],
    ["invalid JSON", { message: undefined }, "$.message"],
  ])("rejects %s payload with field path", (_label, payload, path) => {
    const eventClass = createEventClass("editor.saved", {
      message: isString,
    });
    expect(() => validateEventPayload(eventClass, payload)).toThrow(
      expect.objectContaining({ path }),
    );
  });

  it("wraps thrown validators and rejects every non-boolean result", () => {
    const validatorCause = new Error("predicate failed");
    const throwing = createEventClass("event.throwing", {
      value: eventField(() => {
        throw validatorCause;
      }),
    });
    expect(() => validateEventPayload(throwing, { value: true })).toThrow(
      expect.objectContaining({ cause: validatorCause, path: "$.value" }),
    );

    const nonBoolean = createEventClass("event.non-boolean", {
      value: eventField((() => "yes") as unknown as () => boolean),
    });
    expect(() => validateEventPayload(nonBoolean, { value: true })).toThrow(
      expect.objectContaining({ reason: "validator did not return boolean" }),
    );

    const asynchronous = createEventClass("event.async", {
      value: eventField((() =>
        Promise.resolve(true)) as unknown as () => boolean),
    });
    expect(() => validateEventPayload(asynchronous, { value: true })).toThrow(
      EventPayloadValidationError,
    );
  });

  it.each(["id", "classId", "phase", "raw", "snapshot", "status", "timestamp"])(
    "rejects reserved field %s",
    (field) => {
      expect(() =>
        createEventClass("editor.saved", { [field]: isString }),
      ).toThrow(EventSchemaError);
    },
  );

  it("rejects invalid names, descriptors, symbols, and schema accessors", () => {
    expect(() =>
      createEventClass("editor.saved", { Bad_name: isString }),
    ).toThrow(EventSchemaError);
    expect(() =>
      createEventClass("editor.saved", {
        message: Object.freeze({ required: true, validate: () => true }),
      }),
    ).toThrow(EventSchemaError);
    expect(() =>
      createEventClass("editor.saved", {
        message: isString,
        [Symbol("hidden")]: isString,
      }),
    ).toThrow(EventSchemaError);

    let getterCalls = 0;
    const schema = Object.defineProperty({}, "message", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return isString;
      },
    });
    expect(() => createEventClass("editor.saved", schema)).toThrow(
      EventSchemaError,
    );
    expect(getterCalls).toBe(0);
  });
});
