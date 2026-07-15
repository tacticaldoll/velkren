import { validateEventPayload, type EventClass } from "./event-class.js";
import {
  createManagedInstanceId,
  type ManagedInstanceId,
  type QualifiedRegistrationId,
} from "./identity.js";
import {
  createManagedResource,
  type ManagedStatus,
  type ManagedObject,
} from "./managed-lifecycle.js";
import { ManagedCreationError } from "./registration-errors.js";
import { ManagedReleaseError } from "./runtime-errors.js";
import type { Runtime, RuntimeOwned } from "./runtime.js";
import type { JsonObject } from "./strict-json.js";

export const EventPhase = {
  Created: "created",
  Completed: "completed",
  Failed: "failed",
  Released: "released",
} as const;

export type EventPhase = (typeof EventPhase)[keyof typeof EventPhase];

export interface EventClassRegistration extends RuntimeOwned {
  readonly id: QualifiedRegistrationId;
  readonly classId: EventClass["id"];
  readonly status: ManagedStatus;
  readonly eventClass: EventClass;
  assertActive(operation: string): void;
}

export interface EventInstance extends ManagedObject<ManagedInstanceId> {
  readonly phase: EventPhase;
  readonly raw: unknown;
  readonly snapshot: JsonObject;
}

export interface EventRegistrationStore {
  retain(registration: EventClassRegistration): void;
  releaseDependent(registration: EventClassRegistration): void;
}

interface EventState {
  eventClass: EventClass | undefined;
  phase: EventPhase | undefined;
  raw: unknown;
  snapshot: JsonObject | undefined;
  snapshotText: string | undefined;
}

const eventStates = new WeakMap<object, EventState>();

export interface EventCreateOptions {
  readonly raw?: unknown;
}

export interface EventFactory {
  readonly runtime: Runtime;
  create(
    registration: EventClassRegistration,
    payload: unknown,
    options?: EventCreateOptions,
  ): Promise<EventInstance>;
}

export class EventFactoryKernel implements EventFactory {
  #nextSequence = 0;

  constructor(
    readonly runtime: Runtime,
    private readonly registrations: EventRegistrationStore,
  ) {}

  allocateDiagnosticId(): ManagedInstanceId {
    this.#nextSequence += 1;
    return createManagedInstanceId(
      this.runtime.id,
      "event",
      `event-${this.#nextSequence}`,
    );
  }

  async create(
    registration: EventClassRegistration,
    payload: unknown,
    options: EventCreateOptions = {},
    diagnosticId?: ManagedInstanceId,
  ): Promise<EventInstance> {
    this.runtime.assertOwns(registration);
    registration.assertActive("create an event");
    this.registrations.retain(registration);

    let controller: ReturnType<typeof createManagedResource> | undefined;
    try {
      const eventClass = registration.eventClass;
      const normalized = validateEventPayload(eventClass, payload);
      controller = createManagedResource(
        this.runtime,
        diagnosticId ?? this.allocateDiagnosticId(),
        eventClass.id,
      );
      const instance = controller.object as EventInstance;
      const state: EventState = {
        eventClass,
        phase: EventPhase.Created,
        raw: options.raw,
        snapshot: normalized.value,
        snapshotText: normalized.text,
      };
      eventStates.set(instance, state);
      controller.addCleanup(() =>
        this.registrations.releaseDependent(registration),
      );
      controller.addCleanup(() => {
        state.raw = undefined;
        state.snapshot = undefined;
        state.snapshotText = undefined;
        state.eventClass = undefined;
        state.phase = undefined;
      });
      defineEventAccessors(instance);
      return instance;
    } catch (cause) {
      const cleanupFailures: unknown[] = [];
      if (controller === undefined) {
        try {
          this.registrations.releaseDependent(registration);
        } catch (releaseCause) {
          cleanupFailures.push(releaseCause);
        }
      } else {
        try {
          await controller.object.release();
        } catch (releaseCause) {
          if (releaseCause instanceof ManagedReleaseError) {
            cleanupFailures.push(...releaseCause.failures);
          } else {
            cleanupFailures.push(releaseCause);
          }
        }
      }
      throw new ManagedCreationError(
        registration.classId,
        cause,
        cleanupFailures,
      );
    }
  }
}

export function setEventPhase(
  instance: EventInstance,
  phase: EventPhase,
): void {
  instance.assertActive("advance its event phase");
  getEventState(instance).phase = phase;
}

export function getEventSnapshotText(instance: EventInstance): string {
  instance.assertActive("read its canonical snapshot text");
  const text = getEventState(instance).snapshotText;
  if (text === undefined)
    throw new TypeError("Active event has no snapshot text.");
  return text;
}

function defineEventAccessors(instance: EventInstance): void {
  Object.defineProperties(instance, {
    phase: {
      enumerable: true,
      get(this: EventInstance) {
        this.assertActive("read its event phase");
        const phase = getEventState(this).phase;
        if (phase === undefined)
          throw new TypeError("Active event has no phase.");
        return phase;
      },
    },
    raw: {
      enumerable: true,
      get(this: EventInstance) {
        this.assertActive("read its raw source");
        return getEventState(this).raw;
      },
    },
    snapshot: {
      enumerable: true,
      get(this: EventInstance) {
        this.assertActive("read its snapshot");
        const snapshot = getEventState(this).snapshot;
        if (snapshot === undefined)
          throw new TypeError("Active event has no snapshot.");
        return snapshot;
      },
    },
  });
}

function getEventState(instance: EventInstance): EventState {
  const state = eventStates.get(instance);
  if (state === undefined) {
    throw new TypeError("EventInstance was not created by Velkren.");
  }
  return state;
}
