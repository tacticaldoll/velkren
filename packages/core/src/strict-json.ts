export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
export type JsonArray = readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export const JsonLimits = Object.freeze({
  maxDepth: 32,
  maxNodes: 10_000,
  maxStringLength: 1_000_000,
  maxSerializedBytes: 2_000_000,
});

export class JsonNormalizationError extends TypeError {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`Invalid strict JSON data at ${path}: ${reason}.`);
    this.name = "JsonNormalizationError";
  }
}

export interface JsonSnapshot<Value extends JsonValue = JsonValue> {
  readonly value: Value;
  readonly text: string;
}

interface TraversalState {
  readonly active: WeakSet<object>;
  nodes: number;
}

export function createJsonSnapshot<Value extends JsonValue = JsonValue>(
  input: unknown,
  topLevelOrder?: readonly string[],
): JsonSnapshot<Value> {
  const state: TraversalState = { active: new WeakSet(), nodes: 0 };
  const value = normalize(input, "$", 0, state, topLevelOrder) as Value;
  const text = serializeJson(value);
  const bytes = utf8ByteLength(text);
  if (bytes > JsonLimits.maxSerializedBytes) {
    throw new JsonNormalizationError(
      "$",
      `serialized data exceeds ${JsonLimits.maxSerializedBytes} bytes`,
    );
  }
  return Object.freeze({ value, text });
}

export function cloneJsonFromText<Value extends JsonValue = JsonValue>(
  text: string,
): Value {
  return deepFreezeParsed(JSON.parse(text) as JsonValue) as Value;
}

function normalize(
  input: unknown,
  path: string,
  depth: number,
  state: TraversalState,
  topLevelOrder?: readonly string[],
): JsonValue {
  state.nodes += 1;
  if (state.nodes > JsonLimits.maxNodes) {
    throw new JsonNormalizationError(
      path,
      `data exceeds ${JsonLimits.maxNodes} nodes`,
    );
  }
  if (depth > JsonLimits.maxDepth) {
    throw new JsonNormalizationError(
      path,
      `data exceeds depth ${JsonLimits.maxDepth}`,
    );
  }

  if (input === null || typeof input === "boolean") {
    return input;
  }
  if (typeof input === "string") {
    assertStringLength(input, path);
    return input;
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new JsonNormalizationError(path, "number is not finite");
    }
    return input;
  }
  if (typeof input !== "object") {
    throw new JsonNormalizationError(path, `unsupported ${typeof input} value`);
  }

  if (state.active.has(input)) {
    throw new JsonNormalizationError(path, "data contains a cycle");
  }
  state.active.add(input);
  try {
    return Array.isArray(input)
      ? normalizeArray(input, path, depth, state)
      : normalizeObject(input, path, depth, state, topLevelOrder);
  } finally {
    state.active.delete(input);
  }
}

function normalizeArray(
  input: unknown[],
  path: string,
  depth: number,
  state: TraversalState,
): JsonArray {
  assertNoSymbolKeys(input, path);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const allowed = new Set(["length"]);
  const output: JsonValue[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const key = String(index);
    allowed.add(key);
    const descriptor = descriptors[key];
    if (descriptor === undefined) {
      throw new JsonNormalizationError(`${path}[${index}]`, "array is sparse");
    }
    assertDataDescriptor(descriptor, `${path}[${index}]`);
    output.push(
      normalize(descriptor.value, `${path}[${index}]`, depth + 1, state),
    );
  }
  for (const key of Object.keys(descriptors)) {
    if (!allowed.has(key)) {
      throw new JsonNormalizationError(path, `array has extra property ${key}`);
    }
  }
  return Object.freeze(output);
}

function normalizeObject(
  input: object,
  path: string,
  depth: number,
  state: TraversalState,
  preferredOrder?: readonly string[],
): JsonObject {
  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new JsonNormalizationError(path, "object prototype is not plain");
  }
  assertNoSymbolKeys(input, path);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = orderKeys(Object.keys(descriptors), preferredOrder);
  const output = Object.create(null) as Record<string, JsonValue>;
  for (const key of keys) {
    assertStringLength(key, childPath(path, key));
    const descriptor = descriptors[key];
    if (descriptor === undefined) {
      throw new JsonNormalizationError(
        childPath(path, key),
        "property disappeared",
      );
    }
    assertDataDescriptor(descriptor, childPath(path, key));
    output[key] = normalize(
      descriptor.value,
      childPath(path, key),
      depth + 1,
      state,
    );
  }
  return Object.freeze(output);
}

function assertNoSymbolKeys(input: object, path: string): void {
  if (Object.getOwnPropertySymbols(input).length > 0) {
    throw new JsonNormalizationError(path, "symbol keys are not supported");
  }
}

function assertDataDescriptor(
  descriptor: PropertyDescriptor,
  path: string,
): asserts descriptor is PropertyDescriptor & { value: unknown } {
  if (!("value" in descriptor)) {
    throw new JsonNormalizationError(
      path,
      "accessor properties are not supported",
    );
  }
  if (descriptor.enumerable !== true) {
    throw new JsonNormalizationError(
      path,
      "non-enumerable properties are not supported",
    );
  }
}

function orderKeys(
  keys: readonly string[],
  preferredOrder?: readonly string[],
): string[] {
  if (preferredOrder === undefined) {
    return [...keys].sort();
  }
  const present = new Set(keys);
  const ordered: string[] = [];
  for (const key of preferredOrder) {
    if (present.delete(key)) {
      ordered.push(key);
    }
  }
  return [...ordered, ...[...present].sort()];
}

function childPath(parent: string, key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function assertStringLength(value: string, path: string): void {
  if (value.length > JsonLimits.maxStringLength) {
    throw new JsonNormalizationError(
      path,
      `string exceeds ${JsonLimits.maxStringLength} code units`,
    );
  }
}

function serializeJson(value: JsonValue): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeJson).join(",")}]`;
  }
  const object = value as JsonObject;
  return `{${Object.keys(object)
    .map((key) => `${JSON.stringify(key)}:${serializeJson(object[key]!)}`)
    .join(",")}}`;
}

function deepFreezeParsed(value: JsonValue): JsonValue {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const child of value as JsonArray) {
        deepFreezeParsed(child);
      }
    } else {
      for (const child of Object.values(value as JsonObject)) {
        deepFreezeParsed(child);
      }
    }
    Object.freeze(value);
  }
  return value;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}
