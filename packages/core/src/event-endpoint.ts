import {
  createCanonicalClassId,
  createManagedInstanceId,
  type ManagedInstanceId,
} from "./identity.js";
import {
  createManagedResource,
  type ManagedCleanup,
  type ManagedStatus,
  type ManagedTombstone,
  type ManagedObject,
} from "./managed-lifecycle.js";
import { ManagedReleaseError } from "./runtime-errors.js";
import {
  markRuntimeOwned,
  type Runtime,
  type RuntimeOwned,
} from "./runtime.js";
import { createJsonSnapshot } from "./strict-json.js";

export const EventChannel = { Public: "public", Private: "private" } as const;
export type EventChannel = (typeof EventChannel)[keyof typeof EventChannel];

export const ListenerLifecyclePhase = {
  EndpointCreated: "endpoint-created",
  EndpointReleased: "endpoint-released",
  ListenerInstalled: "listener-installed",
  ListenerReleased: "listener-released",
} as const;
export type ListenerLifecyclePhase =
  (typeof ListenerLifecyclePhase)[keyof typeof ListenerLifecyclePhase];

export interface ListenerLifecycleRecord {
  readonly endpointId: ManagedInstanceId;
  readonly phase: ListenerLifecyclePhase;
  readonly sequence: number;
  readonly timestamp: number;
  readonly listenerId?: ManagedInstanceId;
  readonly listenerClassId?: string;
  readonly channel?: EventChannel;
}

export type ListenerLifecycleObserver = (
  record: ListenerLifecycleRecord,
) => unknown;

export interface EventEndpoint extends RuntimeOwned {
  readonly id: ManagedInstanceId;
  readonly status: ManagedStatus;
  readonly tombstone: ManagedTombstone | undefined;
  assertActive(operation: string): void;
}

export interface PrivateEventEndpoint extends RuntimeOwned {
  readonly endpoint: EventEndpoint;
  release(): Promise<void>;
}

export interface EventEndpointPair {
  readonly endpoint: EventEndpoint;
  readonly privateEndpoint: PrivateEventEndpoint;
}

export class InvalidEventEndpointError extends TypeError {
  constructor() {
    super("Event endpoint capability lacks framework provenance.");
    this.name = "InvalidEventEndpointError";
  }
}

export class EventEndpointCreationError extends Error {
  readonly cleanupFailures: readonly unknown[];
  constructor(cause: unknown, cleanupFailures: readonly unknown[]) {
    super("Event endpoint creation failed.", { cause });
    this.name = "EventEndpointCreationError";
    this.cleanupFailures = Object.freeze([...cleanupFailures]);
  }
}

interface EndpointState {
  activePublications: number;
  lifecycleSequence: number;
  readonly addCleanup: (cleanup: ManagedCleanup) => void;
  nextInstallationSequence: number;
  readonly listeners: Map<number, ManagedObject>;
}

const endpointStates = new WeakMap<EventEndpoint, EndpointState>();
const privateEndpoints = new WeakMap<PrivateEventEndpoint, EventEndpoint>();
const runtimeSequences = new WeakMap<Runtime, number>();

export async function createEventEndpoint(
  runtime: Runtime,
  observer?: ListenerLifecycleObserver,
): Promise<EventEndpointPair> {
  const pair = createEndpoint(runtime, observer);
  if (observer !== undefined) {
    try {
      await emitLifecycle(
        pair.endpoint,
        observer,
        ListenerLifecyclePhase.EndpointCreated,
      );
    } catch (cause) {
      const failures: unknown[] = [];
      try {
        await pair.privateEndpoint.release();
      } catch (releaseCause) {
        if (releaseCause instanceof ManagedReleaseError)
          failures.push(...releaseCause.failures);
        else failures.push(releaseCause);
      }
      throw new EventEndpointCreationError(cause, failures);
    }
  }
  return pair;
}

export function createDefaultEventEndpoint(
  runtime: Runtime,
): EventEndpointPair {
  return createEndpoint(runtime);
}

export function assertEventEndpoint(
  runtime: Runtime,
  endpoint: EventEndpoint,
): void {
  runtime.assertOwns(endpoint);
  if (!endpointStates.has(endpoint)) throw new InvalidEventEndpointError();
  endpoint.assertActive("use its endpoint authority");
}

export function assertPrivateEventEndpoint(
  runtime: Runtime,
  capability: PrivateEventEndpoint,
): EventEndpoint {
  runtime.assertOwns(capability);
  const endpoint = privateEndpoints.get(capability);
  if (endpoint === undefined) throw new InvalidEventEndpointError();
  assertEventEndpoint(runtime, endpoint);
  return endpoint;
}

export function resolveEndpointAuthority(
  runtime: Runtime,
  authority: EventEndpoint | PrivateEventEndpoint,
): Readonly<{ endpoint: EventEndpoint; channel: EventChannel }> {
  runtime.assertOwns(authority);
  if (endpointStates.has(authority as EventEndpoint)) {
    const endpoint = authority as EventEndpoint;
    assertEventEndpoint(runtime, endpoint);
    return Object.freeze({ endpoint, channel: EventChannel.Public });
  }
  const endpoint = privateEndpoints.get(authority as PrivateEventEndpoint);
  if (endpoint === undefined) throw new InvalidEventEndpointError();
  assertEventEndpoint(runtime, endpoint);
  return Object.freeze({ endpoint, channel: EventChannel.Private });
}

export function trackEndpointPublication(endpoint: EventEndpoint): () => void {
  endpoint.assertActive("begin endpoint publication");
  const state = getState(endpoint);
  state.activePublications += 1;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    state.activePublications -= 1;
  };
}

export function endpointPublicationCount(endpoint: EventEndpoint): number {
  return getState(endpoint).activePublications;
}

export function addEndpointCleanup(
  endpoint: EventEndpoint,
  cleanup: ManagedCleanup,
): void {
  getState(endpoint).addCleanup(cleanup);
}

export function installEndpointListener(
  endpoint: EventEndpoint,
  listener: ManagedObject,
): { readonly sequence: number; remove(): void } {
  endpoint.assertActive("install an endpoint listener");
  const state = getState(endpoint);
  state.nextInstallationSequence += 1;
  const sequence = state.nextInstallationSequence;
  state.listeners.set(sequence, listener);
  let installed = true;
  return Object.freeze({
    sequence,
    remove() {
      if (!installed) return;
      installed = false;
      state.listeners.delete(sequence);
    },
  });
}

export function snapshotEndpointListeners(
  endpoint: EventEndpoint,
): readonly ManagedObject[] {
  endpoint.assertActive("snapshot endpoint listeners");
  return Object.freeze([...getState(endpoint).listeners.values()]);
}

export async function emitListenerLifecycle(
  endpoint: EventEndpoint,
  observer: ListenerLifecycleObserver | undefined,
  phase:
    | typeof ListenerLifecyclePhase.ListenerInstalled
    | typeof ListenerLifecyclePhase.ListenerReleased,
  listener: ManagedObject,
  channel: EventChannel,
): Promise<void> {
  if (observer === undefined) return;
  await emitLifecycle(endpoint, observer, phase, {
    listenerId: listener.id,
    listenerClassId: listener.classId,
    channel,
  });
}

function createEndpoint(
  runtime: Runtime,
  observer?: ListenerLifecycleObserver,
): EventEndpointPair {
  const next = (runtimeSequences.get(runtime) ?? 0) + 1;
  runtimeSequences.set(runtime, next);
  const controller = createManagedResource(
    runtime,
    createManagedInstanceId(runtime.id, "event-endpoint", `endpoint-${next}`),
    createCanonicalClassId("event-endpoint", "endpoint"),
  );
  const resource = controller.object;
  const endpoint = Object.freeze(
    markRuntimeOwned(runtime, {
      id: resource.id,
      get status() {
        return resource.status;
      },
      get tombstone() {
        return resource.tombstone;
      },
      assertActive(operation: string) {
        resource.assertActive(operation);
      },
    }),
  );
  endpointStates.set(endpoint, {
    activePublications: 0,
    lifecycleSequence: 0,
    nextInstallationSequence: 0,
    listeners: new Map(),
    addCleanup: controller.addCleanup,
  });
  if (observer !== undefined) {
    controller.addCleanup(() =>
      emitLifecycle(
        endpoint,
        observer,
        ListenerLifecyclePhase.EndpointReleased,
      ),
    );
  }
  const privateEndpoint = Object.freeze(
    markRuntimeOwned(runtime, {
      endpoint,
      release: () => resource.release(),
    }),
  );
  privateEndpoints.set(privateEndpoint, endpoint);
  return Object.freeze({ endpoint, privateEndpoint });
}

async function emitLifecycle(
  endpoint: EventEndpoint,
  observer: ListenerLifecycleObserver,
  phase: ListenerLifecyclePhase,
  details:
    | Readonly<{
        listenerId: ManagedInstanceId;
        listenerClassId: string;
        channel: EventChannel;
      }>
    | undefined = undefined,
): Promise<void> {
  const state = getState(endpoint);
  state.lifecycleSequence += 1;
  const record = createJsonSnapshot({
    endpointId: endpoint.id,
    phase,
    sequence: state.lifecycleSequence,
    timestamp: Date.now(),
    ...details,
  }).value as unknown as ListenerLifecycleRecord;
  await observer(record);
}

function getState(endpoint: EventEndpoint): EndpointState {
  const state = endpointStates.get(endpoint);
  if (state === undefined) throw new InvalidEventEndpointError();
  return state;
}
