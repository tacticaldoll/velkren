import {
  createCanonicalClassId,
  createLocalClassSlug,
  type CanonicalClassId,
  type LocalClassSlug,
} from "./identity.js";
import {
  createJsonSnapshot,
  JsonNormalizationError,
  type JsonObject,
  type JsonSnapshot,
  type JsonValue,
} from "./strict-json.js";

const FIELD_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const RESERVED_FIELD_NAMES = new Set([
  "classId",
  "id",
  "phase",
  "raw",
  "snapshot",
  "status",
  "timestamp",
]);

export type EventFieldValidator = (value: JsonValue) => boolean;

export interface EventField {
  readonly required: boolean;
  readonly validate: EventFieldValidator;
}

export type EventSchema = Readonly<Record<string, EventField>>;

export interface EventClass {
  readonly id: CanonicalClassId;
  readonly localSlug: LocalClassSlug;
  readonly schema: EventSchema;
}

const eventFields = new WeakSet<object>();
const eventClasses = new WeakSet<object>();

export class EventSchemaError extends TypeError {
  constructor(
    readonly field: string | undefined,
    readonly reason: string,
  ) {
    super(
      field === undefined
        ? `Invalid EventClass schema: ${reason}.`
        : `Invalid EventClass schema field ${JSON.stringify(field)}: ${reason}.`,
    );
    this.name = "EventSchemaError";
  }
}

export class EventPayloadValidationError extends TypeError {
  constructor(
    readonly eventClassId: CanonicalClassId,
    readonly path: string,
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(
      `Invalid payload for ${JSON.stringify(eventClassId)} at ${path}: ${reason}.`,
      options,
    );
    this.name = "EventPayloadValidationError";
  }
}

export function eventField(validate: EventFieldValidator): EventField {
  return createEventField(true, validate);
}

export function optionalEventField(validate: EventFieldValidator): EventField {
  return createEventField(false, validate);
}

export function createEventClass(
  slug: string,
  schema: Readonly<Record<string, EventField>>,
): EventClass {
  const localSlug = createLocalClassSlug(slug);
  const immutableSchema = copySchema(schema);
  const definition = {
    id: createCanonicalClassId("event", localSlug),
    localSlug,
    schema: immutableSchema,
  };
  eventClasses.add(definition);
  return Object.freeze(definition);
}

export function isEventClass(value: unknown): value is EventClass {
  return (
    typeof value === "object" &&
    value !== null &&
    eventClasses.has(value) &&
    Object.isFrozen(value)
  );
}

export function validateEventPayload(
  eventClass: EventClass,
  payload: unknown,
): JsonSnapshot<JsonObject> {
  if (!isEventClass(eventClass)) {
    throw new EventSchemaError(undefined, "class lacks helper provenance");
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new EventPayloadValidationError(
      eventClass.id,
      "$",
      "top-level payload is not a plain object",
    );
  }
  const fields = Object.keys(eventClass.schema);
  let snapshot: JsonSnapshot<JsonObject>;
  try {
    snapshot = createJsonSnapshot<JsonObject>(payload, fields);
  } catch (cause) {
    if (cause instanceof JsonNormalizationError) {
      throw new EventPayloadValidationError(
        eventClass.id,
        cause.path,
        cause.reason,
        { cause },
      );
    }
    throw cause;
  }
  const present = new Set(Object.keys(snapshot.value));
  for (const key of present) {
    if (!(key in eventClass.schema)) {
      throw new EventPayloadValidationError(
        eventClass.id,
        fieldPath(key),
        "field is not declared",
      );
    }
  }
  for (const field of fields) {
    const descriptor = eventClass.schema[field]!;
    if (!present.has(field)) {
      if (descriptor.required) {
        throw new EventPayloadValidationError(
          eventClass.id,
          fieldPath(field),
          "required field is missing",
        );
      }
      continue;
    }
    const value = snapshot.value[field]!;
    let result: unknown;
    try {
      result = descriptor.validate(value);
    } catch (cause) {
      throw new EventPayloadValidationError(
        eventClass.id,
        fieldPath(field),
        "validator threw",
        { cause },
      );
    }
    if (typeof result !== "boolean") {
      throw new EventPayloadValidationError(
        eventClass.id,
        fieldPath(field),
        "validator did not return boolean",
      );
    }
    if (!result) {
      throw new EventPayloadValidationError(
        eventClass.id,
        fieldPath(field),
        "validator rejected value",
      );
    }
  }
  return snapshot;
}

function createEventField(
  required: boolean,
  validate: EventFieldValidator,
): EventField {
  if (typeof validate !== "function") {
    throw new EventSchemaError(undefined, "field validator is not a function");
  }
  const field = { required, validate };
  eventFields.add(field);
  return Object.freeze(field);
}

function copySchema(schema: Readonly<Record<string, EventField>>): EventSchema {
  if (
    typeof schema !== "object" ||
    schema === null ||
    (Object.getPrototypeOf(schema) !== Object.prototype &&
      Object.getPrototypeOf(schema) !== null)
  ) {
    throw new EventSchemaError(undefined, "schema is not a plain object");
  }
  if (Object.getOwnPropertySymbols(schema).length > 0) {
    throw new EventSchemaError(undefined, "symbol fields are not supported");
  }
  const descriptors = Object.getOwnPropertyDescriptors(schema);
  const output = Object.create(null) as Record<string, EventField>;
  for (const field of Object.keys(descriptors)) {
    if (!FIELD_NAME_PATTERN.test(field)) {
      throw new EventSchemaError(field, "name is not a lower-camel identifier");
    }
    if (RESERVED_FIELD_NAMES.has(field)) {
      throw new EventSchemaError(field, "name is reserved by the framework");
    }
    const descriptor = descriptors[field]!;
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
      throw new EventSchemaError(field, "field must be enumerable data");
    }
    const value: unknown = descriptor.value;
    if (
      typeof value !== "object" ||
      value === null ||
      !eventFields.has(value) ||
      !Object.isFrozen(value)
    ) {
      throw new EventSchemaError(field, "descriptor lacks helper provenance");
    }
    output[field] = value as EventField;
  }
  return Object.freeze(output);
}

function fieldPath(field: string): string {
  return `$${FIELD_NAME_PATTERN.test(field) ? `.${field}` : `[${JSON.stringify(field)}]`}`;
}
