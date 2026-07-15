import { describe, expect, it } from "vitest";

import {
  JsonLimits,
  JsonNormalizationError,
  cloneJsonFromText,
  createJsonSnapshot,
  type JsonObject,
} from "../src/strict-json.js";

describe("strict JSON snapshot", () => {
  it("accepts every JSON primitive and container with deterministic order", () => {
    const snapshot = createJsonSnapshot(
      {
        z: null,
        a: [true, false, 0, -1.5, "text", { z: 2, a: 1 }],
      },
      ["z", "a"],
    );

    expect(snapshot.text).toBe(
      '{"z":null,"a":[true,false,0,-1.5,"text",{"a":1,"z":2}]}',
    );
    expect(Object.getPrototypeOf(snapshot.value)).toBeNull();
    expect(Object.isFrozen(snapshot.value)).toBe(true);
    expect(Object.isFrozen((snapshot.value as JsonObject).a)).toBe(true);
  });

  it("detaches shared references into an immutable tree", () => {
    const shared = { value: "before" };
    const input = { first: shared, second: shared };
    const snapshot = createJsonSnapshot<JsonObject>(input);
    shared.value = "after";

    expect((snapshot.value.first as JsonObject).value).toBe("before");
    expect(snapshot.value.first).not.toBe(snapshot.value.second);
    expect(
      Reflect.set(snapshot.value.first as object, "value", "changed"),
    ).toBe(false);

    const traceCopy = cloneJsonFromText<JsonObject>(snapshot.text);
    expect(traceCopy).toEqual(snapshot.value);
    expect(traceCopy).not.toBe(snapshot.value);
    expect(Object.isFrozen(traceCopy.first)).toBe(true);
  });

  it("does not invoke accessors or inherited array toJSON", () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "unsafe";
      },
    });
    expect(() => createJsonSnapshot(accessor)).toThrow(JsonNormalizationError);
    expect(getterCalls).toBe(0);

    const arrayPrototype = Array.prototype as unknown as {
      toJSON?: () => unknown;
    };
    const previous = arrayPrototype.toJSON;
    let toJsonCalls = 0;
    arrayPrototype.toJSON = () => {
      toJsonCalls += 1;
      return ["unsafe"];
    };
    try {
      expect(createJsonSnapshot(["safe"]).text).toBe('["safe"]');
      expect(toJsonCalls).toBe(0);
    } finally {
      if (previous === undefined) delete arrayPrototype.toJSON;
      else arrayPrototype.toJSON = previous;
    }
  });

  it.each([
    ["undefined", { value: undefined }],
    ["function", { value: () => undefined }],
    ["symbol", { value: Symbol("value") }],
    ["bigint", { value: 1n }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["date", { value: new Date(0) }],
  ])("rejects unsupported %s values with a path", (_label, input) => {
    expect(() => createJsonSnapshot(input)).toThrow(
      expect.objectContaining({ path: "$.value" }),
    );
  });

  it("rejects symbols, hidden properties, sparse arrays, and extra array keys", () => {
    const symbolKey = { value: 1, [Symbol("hidden")]: 2 };
    const hidden = Object.defineProperty({}, "value", {
      enumerable: false,
      value: 1,
    });
    const sparse = Array(1);
    const extra = [1] as number[] & { extra?: number };
    extra.extra = 2;

    for (const input of [symbolKey, hidden, sparse, extra]) {
      expect(() => createJsonSnapshot(input)).toThrow(JsonNormalizationError);
    }
  });

  it("rejects cycles while permitting repeated acyclic references", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => createJsonSnapshot(cycle)).toThrow(
      expect.objectContaining({ path: "$.self" }),
    );

    const shared = { value: 1 };
    expect(() =>
      createJsonSnapshot({ first: shared, second: shared }),
    ).not.toThrow();
  });

  it("preserves __proto__ as data without changing snapshot prototypes", () => {
    const input = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(input, "__proto__", {
      enumerable: true,
      value: { polluted: true },
    });
    const snapshot = createJsonSnapshot<JsonObject>(input);

    expect(Object.getPrototypeOf(snapshot.value)).toBeNull();
    expect((snapshot.value.__proto__ as JsonObject).polluted).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("enforces depth, node, string, and serialized byte limits", () => {
    let deep: unknown = null;
    for (let index = 0; index <= JsonLimits.maxDepth; index += 1) {
      deep = [deep];
    }
    expect(() => createJsonSnapshot(deep)).toThrow(JsonNormalizationError);

    expect(() =>
      createJsonSnapshot(
        Array.from({ length: JsonLimits.maxNodes }, () => null),
      ),
    ).toThrow(JsonNormalizationError);
    expect(() =>
      createJsonSnapshot("x".repeat(JsonLimits.maxStringLength + 1)),
    ).toThrow(JsonNormalizationError);
    let byteFailure: unknown;
    try {
      createJsonSnapshot([
        "é".repeat(JsonLimits.maxStringLength),
        "é".repeat(JsonLimits.maxStringLength),
      ]);
    } catch (error) {
      byteFailure = error;
    }
    expect(byteFailure).toBeInstanceOf(JsonNormalizationError);
    if (byteFailure instanceof JsonNormalizationError) {
      expect(byteFailure.reason).toContain("bytes");
    }
  });
});
