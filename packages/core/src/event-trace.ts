import type { CanonicalClassId, ManagedInstanceId } from "./identity.js";
import type { EventPhase } from "./event-instance.js";
import {
  cloneJsonFromText,
  createJsonSnapshot,
  type JsonObject,
} from "./strict-json.js";

export interface EventTraceOutcome {
  readonly classification: string;
  readonly message: string;
}

export interface EventTraceRecord {
  readonly eventId: ManagedInstanceId;
  readonly classId: CanonicalClassId;
  readonly phase: EventPhase;
  readonly sequence: number;
  readonly timestamp: number;
  readonly outcome: EventTraceOutcome;
  readonly snapshot?: JsonObject;
}

export type EventTraceTranscript = readonly EventTraceRecord[];
export type EventTraceSink = (record: EventTraceRecord) => void | Promise<void>;

export const noopEventTraceSink: EventTraceSink = () => undefined;

export class EventTraceBuilder {
  #nextSequence = 0;

  createRecord(input: {
    readonly eventId: ManagedInstanceId;
    readonly classId: CanonicalClassId;
    readonly phase: EventPhase;
    readonly outcome?: EventTraceOutcome;
    readonly snapshotText?: string;
  }): EventTraceRecord {
    this.#nextSequence += 1;
    const record: Record<string, unknown> = {
      eventId: input.eventId,
      classId: input.classId,
      phase: input.phase,
      sequence: this.#nextSequence,
      timestamp: Date.now(),
      outcome: input.outcome ?? successOutcome(input.phase),
    };
    if (input.snapshotText !== undefined) {
      record.snapshot = cloneJsonFromText<JsonObject>(input.snapshotText);
    }
    return createJsonSnapshot(record).value as unknown as EventTraceRecord;
  }

  createTranscript(records: readonly EventTraceRecord[]): EventTraceTranscript {
    return Object.freeze([...records]);
  }
}

export function safeEventTraceOutcome(cause: unknown): EventTraceOutcome {
  let classification = "UnknownError";
  let message = "Event dispatch failed.";
  if (typeof cause === "string") {
    classification = "ThrownString";
    message = boundedDiagnostic(cause);
  } else if (typeof cause === "object" && cause !== null) {
    try {
      const descriptors = Object.getOwnPropertyDescriptors(cause);
      const ownName: unknown = descriptors.name?.value;
      const ownMessage: unknown = descriptors.message?.value;
      if (typeof ownName === "string" && ownName.length > 0) {
        classification = boundedDiagnostic(ownName);
      } else if (cause instanceof Error) {
        classification = "Error";
      }
      if (typeof ownMessage === "string" && ownMessage.length > 0) {
        message = boundedDiagnostic(ownMessage);
      }
    } catch {
      // An adversarial diagnostic value must not interrupt event finalization.
    }
  }
  return createJsonSnapshot({ classification, message })
    .value as unknown as EventTraceOutcome;
}

function boundedDiagnostic(value: string): string {
  return value.length <= 1_000 ? value : `${value.slice(0, 999)}…`;
}

function successOutcome(phase: EventPhase): EventTraceOutcome {
  return createJsonSnapshot({
    classification: "ok",
    message: `Event phase ${phase} completed.`,
  }).value as unknown as EventTraceOutcome;
}
