import { createDefinitionKind, type ClassDefinition } from "./definition.js";
import {
  addEndpointCleanup,
  emitListenerLifecycle,
  EventChannel,
  installEndpointListener,
  ListenerLifecyclePhase,
  resolveEndpointAuthority,
  type EventEndpoint,
  type ListenerLifecycleObserver,
  type PrivateEventEndpoint,
  snapshotEndpointListeners,
  trackEndpointPublication,
} from "./event-endpoint.js";
import {
  createManagedInstanceId,
  type CanonicalClassId,
  type QualifiedRegistrationId,
} from "./identity.js";
import {
  isListenerClass,
  type ListenerClass,
  type ListenerInstance,
  executeListener,
} from "./listener-class.js";
import type { EventInstance } from "./event-instance.js";
import {
  createManagedResource,
  type ManagedStatus,
} from "./managed-lifecycle.js";
import { ManagedReleaseError } from "./runtime-errors.js";
import {
  markRuntimeOwned,
  type Runtime,
  type RuntimeOwned,
} from "./runtime.js";
import { TypedRegistry, type Registration } from "./typed-registry.js";

const listenerDefinitions = createDefinitionKind<ListenerClass>("listener");
const runtimeSequences = new WeakMap<Runtime, number>();

export interface ListenerClassRegistration extends RuntimeOwned {
  readonly id: QualifiedRegistrationId;
  readonly classId: CanonicalClassId;
  readonly status: ManagedStatus;
  readonly listenerClass: ListenerClass;
  assertActive(operation: string): void;
}

export interface ListenerFactory {
  readonly runtime: Runtime;
  create(
    registration: ListenerClassRegistration,
    authority: EventEndpoint | PrivateEventEndpoint,
  ): Promise<ListenerInstance>;
}

export class ListenerCreationError extends Error {
  readonly cleanupFailures: readonly unknown[];
  constructor(cause: unknown, cleanupFailures: readonly unknown[]) {
    super("Listener instance creation failed.", { cause });
    this.name = "ListenerCreationError";
    this.cleanupFailures = Object.freeze([...cleanupFailures]);
  }
}

interface ListenerState {
  endpoint: EventEndpoint | undefined;
  listenerClass: ListenerClass | undefined;
  readonly channel: EventChannel;
}

const listenerStates = new WeakMap<ListenerInstance, ListenerState>();

export class ListenerRegistry {
  readonly #registry: TypedRegistry<ListenerClass>;
  readonly #definitions = new WeakMap<
    ListenerClass,
    ClassDefinition<ListenerClass>
  >();
  readonly #classes = new WeakMap<
    ClassDefinition<ListenerClass>,
    ListenerClass
  >();
  readonly #wrappers = new WeakMap<
    Registration<ListenerClass>,
    ListenerClassRegistration
  >();
  readonly #registrations = new WeakMap<
    ListenerClassRegistration,
    Registration<ListenerClass>
  >();

  constructor(readonly runtime: Runtime) {
    this.#registry = new TypedRegistry(runtime, listenerDefinitions.kind);
  }

  register(listenerClass: ListenerClass): ListenerClassRegistration {
    return this.#wrap(this.#registry.register(this.#adapt(listenerClass)));
  }

  async replace(
    listenerClass: ListenerClass,
  ): Promise<ListenerClassRegistration> {
    return this.#wrap(await this.#registry.replace(this.#adapt(listenerClass)));
  }

  unregister(classId: CanonicalClassId): Promise<void> {
    return this.#registry.unregister(classId);
  }

  resolve(classId: CanonicalClassId): ListenerClassRegistration | undefined {
    const registration = this.#registry.resolve(classId);
    return registration === undefined ? undefined : this.#wrap(registration);
  }

  retain(wrapper: ListenerClassRegistration): Registration<ListenerClass> {
    const registration = this.#unwrap(wrapper);
    this.#registry.retain(registration);
    return registration;
  }

  releaseDependent(registration: Registration<ListenerClass>): void {
    this.#registry.releaseDependent(registration);
  }

  #adapt(listenerClass: ListenerClass): ClassDefinition<ListenerClass> {
    if (!isListenerClass(listenerClass)) {
      throw new TypeError("ListenerClass lacks immutable helper provenance.");
    }
    let definition = this.#definitions.get(listenerClass);
    if (definition === undefined) {
      definition = listenerDefinitions.define(
        listenerClass.localSlug,
        () => listenerClass,
      );
      this.#definitions.set(listenerClass, definition);
      this.#classes.set(definition, listenerClass);
    }
    return definition;
  }

  #wrap(registration: Registration<ListenerClass>): ListenerClassRegistration {
    let wrapper = this.#wrappers.get(registration);
    if (wrapper !== undefined) return wrapper;
    const classes = this.#classes;
    wrapper = Object.freeze(
      markRuntimeOwned(this.runtime, {
        id: registration.id,
        classId: registration.classId,
        get status() {
          return registration.status;
        },
        get listenerClass() {
          registration.assertActive("read its ListenerClass");
          const listenerClass = classes.get(registration.definition);
          if (listenerClass === undefined)
            throw new TypeError("Registration has no ListenerClass.");
          return listenerClass;
        },
        assertActive(operation: string) {
          registration.assertActive(operation);
        },
      }),
    );
    this.#wrappers.set(registration, wrapper);
    this.#registrations.set(wrapper, registration);
    return wrapper;
  }

  #unwrap(wrapper: ListenerClassRegistration): Registration<ListenerClass> {
    this.runtime.assertOwns(wrapper);
    const registration = this.#registrations.get(wrapper);
    if (registration === undefined) {
      throw new TypeError(
        "ListenerClassRegistration does not belong to this listener domain.",
      );
    }
    return registration;
  }
}

export function createListenerFactory(
  runtime: Runtime,
  registry: ListenerRegistry,
  observer?: ListenerLifecycleObserver,
  finalCleanup?: (
    registration: ListenerClassRegistration,
  ) => void | Promise<void>,
): ListenerFactory {
  if (registry.runtime !== runtime)
    throw new TypeError("Listener registry belongs to another Runtime.");
  return Object.freeze({
    runtime,
    async create(
      registration: ListenerClassRegistration,
      authority: EventEndpoint | PrivateEventEndpoint,
    ) {
      const { endpoint, channel } = resolveEndpointAuthority(
        runtime,
        authority,
      );
      const retained = registry.retain(registration);
      const listenerClass = registration.listenerClass;
      const next = (runtimeSequences.get(runtime) ?? 0) + 1;
      runtimeSequences.set(runtime, next);
      const controller = createManagedResource(
        runtime,
        createManagedInstanceId(runtime.id, "listener", `listener-${next}`),
        listenerClass.id,
      );
      const listener = controller.object as ListenerInstance;
      const membership = installEndpointListener(endpoint, listener);
      Object.defineProperty(listener, "installationSequence", {
        enumerable: true,
        value: membership.sequence,
      });
      listenerStates.set(listener, { endpoint, listenerClass, channel });
      if (finalCleanup !== undefined) {
        controller.addCleanup(() => finalCleanup(registration));
      }
      controller.addCleanup(() =>
        emitListenerLifecycle(
          endpoint,
          observer,
          ListenerLifecyclePhase.ListenerReleased,
          listener,
          channel,
        ),
      );
      controller.addCleanup(() => registry.releaseDependent(retained));
      controller.addCleanup(() => membership.remove());
      controller.addCleanup(() => {
        const state = getListenerState(listener);
        state.endpoint = undefined;
        state.listenerClass = undefined;
      });
      addEndpointCleanup(endpoint, () => listener.release());
      try {
        await emitListenerLifecycle(
          endpoint,
          observer,
          ListenerLifecyclePhase.ListenerInstalled,
          listener,
          channel,
        );
      } catch (cause) {
        const cleanupFailures: unknown[] = [];
        try {
          await listener.release();
        } catch (releaseCause) {
          if (releaseCause instanceof ManagedReleaseError)
            cleanupFailures.push(...releaseCause.failures);
          else cleanupFailures.push(releaseCause);
        }
        throw new ListenerCreationError(cause, cleanupFailures);
      }
      return listener;
    },
  });
}

export function readActiveListenerContext(
  listener: ListenerInstance,
): Readonly<{
  endpoint: EventEndpoint;
  listenerClass: ListenerClass;
  channel: EventChannel;
}> {
  listener.assertActive("read its listener context");
  const state = getListenerState(listener);
  if (state.endpoint === undefined || state.listenerClass === undefined) {
    throw new TypeError("Active listener has no live context.");
  }
  return Object.freeze({
    endpoint: state.endpoint,
    listenerClass: state.listenerClass,
    channel: state.channel,
  });
}

export async function reactEndpoint(
  endpoint: EventEndpoint,
  channel: EventChannel,
  event: EventInstance,
): Promise<boolean> {
  const finishPublication = trackEndpointPublication(endpoint);
  try {
    const listeners = snapshotEndpointListeners(
      endpoint,
    ) as readonly ListenerInstance[];
    for (const listener of listeners) {
      if (listener.status !== "active") continue;
      const context = readActiveListenerContext(listener);
      if (
        context.channel !== channel ||
        context.listenerClass.eventClass.id !== event.classId
      )
        continue;
      const shortCircuited = await executeListener(context.listenerClass, {
        event,
        endpoint,
        channel,
        listener,
      });
      if (shortCircuited) return true;
    }
    return false;
  } finally {
    finishPublication();
  }
}

function getListenerState(listener: ListenerInstance): ListenerState {
  const state = listenerStates.get(listener);
  if (state === undefined)
    throw new TypeError("ListenerInstance was not created by Velkren.");
  return state;
}
