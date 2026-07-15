import type { CanonicalClassId } from "./identity.js";
import {
  EventPhase,
  getEventSnapshotText,
  setEventPhase,
  type EventClassRegistration,
  type EventFactoryKernel,
  type EventInstance,
} from "./event-instance.js";
import {
  EventTraceBuilder,
  noopEventTraceSink,
  safeEventTraceOutcome,
  type EventTraceRecord,
  type EventTraceSink,
  type EventTraceTranscript,
} from "./event-trace.js";
import { MissingRegistrationError } from "./registration-errors.js";
import { ManagedReleaseError } from "./runtime-errors.js";

export type EventClassResolver = (
  classId: CanonicalClassId,
) => EventClassRegistration | Promise<EventClassRegistration>;

export interface EventDispatchOptions {
  readonly raw?: unknown;
}

export class EventDispatchError extends Error {
  readonly transcript: EventTraceTranscript;
  readonly traceFailures: readonly unknown[];
  readonly releaseFailures: readonly unknown[];

  constructor(
    readonly primaryCause: unknown,
    transcript: EventTraceTranscript,
    traceFailures: readonly unknown[],
    releaseFailures: readonly unknown[],
  ) {
    super("Semantic event dispatch failed.", {
      cause: primaryCause ?? traceFailures[0] ?? releaseFailures[0],
    });
    this.name = "EventDispatchError";
    this.transcript = transcript;
    this.traceFailures = Object.freeze([...traceFailures]);
    this.releaseFailures = Object.freeze([...releaseFailures]);
  }
}

export class EventDispatcher {
  readonly #trace = new EventTraceBuilder();
  readonly #sink: EventTraceSink;

  constructor(
    readonly factory: EventFactoryKernel,
    readonly resolve: EventClassResolver,
    sink?: EventTraceSink,
  ) {
    this.#sink = sink ?? noopEventTraceSink;
  }

  async dispatch(
    classId: CanonicalClassId,
    payload: unknown,
    options: EventDispatchOptions = {},
  ): Promise<EventTraceTranscript> {
    const eventId = this.factory.allocateDiagnosticId();
    const records: EventTraceRecord[] = [];
    const traceFailures: unknown[] = [];
    const releaseFailures: unknown[] = [];
    let instance: EventInstance | undefined;
    let snapshotText: string | undefined;
    let primaryCause: unknown;

    try {
      const registration = await this.resolve(classId);
      if (registration.classId !== classId) {
        throw new MissingRegistrationError(classId);
      }
      instance = await this.factory.create(
        registration,
        payload,
        { raw: options.raw },
        eventId,
      );
      snapshotText = getEventSnapshotText(instance);
      await this.#emit(
        records,
        traceFailures,
        this.#trace.createRecord({
          eventId,
          classId,
          phase: EventPhase.Created,
          snapshotText,
        }),
      );
      if (traceFailures.length > 0) throw traceFailures[0];
      setEventPhase(instance, EventPhase.Completed);
      await this.#emit(
        records,
        traceFailures,
        this.#trace.createRecord({
          eventId,
          classId,
          phase: EventPhase.Completed,
          snapshotText,
        }),
      );
      if (traceFailures.length > 0) throw traceFailures[0];
    } catch (cause) {
      primaryCause = traceFailures.includes(cause) ? undefined : cause;
      if (instance !== undefined) setEventPhase(instance, EventPhase.Failed);
      await this.#emit(
        records,
        traceFailures,
        this.#trace.createRecord({
          eventId,
          classId,
          phase: EventPhase.Failed,
          outcome: safeEventTraceOutcome(cause),
          ...(snapshotText === undefined ? {} : { snapshotText }),
        }),
      );
    } finally {
      if (instance !== undefined) {
        try {
          await instance.release();
        } catch (cause) {
          if (cause instanceof ManagedReleaseError) {
            releaseFailures.push(...cause.failures);
          } else {
            releaseFailures.push(cause);
          }
        }
        await this.#emit(
          records,
          traceFailures,
          this.#trace.createRecord({
            eventId,
            classId,
            phase: EventPhase.Released,
            ...(releaseFailures.length === 0
              ? {}
              : { outcome: safeEventTraceOutcome(releaseFailures[0]) }),
          }),
        );
      }
    }

    const transcript = this.#trace.createTranscript(records);
    if (
      primaryCause !== undefined ||
      traceFailures.length > 0 ||
      releaseFailures.length > 0
    ) {
      throw new EventDispatchError(
        primaryCause,
        transcript,
        traceFailures,
        releaseFailures,
      );
    }
    return transcript;
  }

  async #emit(
    records: EventTraceRecord[],
    failures: unknown[],
    record: EventTraceRecord,
  ): Promise<void> {
    records.push(record);
    try {
      await this.#sink(record);
    } catch (cause) {
      failures.push(cause);
    }
  }
}
