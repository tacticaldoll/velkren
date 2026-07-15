import { createDefinitionKind, type ClassDefinition } from "./definition.js";
import {
  createEventClass,
  isEventClass,
  type EventClass,
  type EventSchema,
} from "./event-class.js";
import {
  EventChannel,
  assertEventEndpoint,
  assertPrivateEventEndpoint,
  createDefaultEventEndpoint,
  createEventEndpoint,
  resolveEndpointAuthority,
  type EventEndpoint,
  type EventEndpointPair,
  type ListenerLifecycleObserver,
  type PrivateEventEndpoint,
} from "./event-endpoint.js";
import {
  EventDispatcher,
  getEventRelayDepth,
  type EventDispatchOptions,
} from "./event-dispatch.js";
import {
  EventFactoryKernel,
  getEventSnapshotText,
  type EventClassRegistration,
  type EventCreateOptions,
  type EventInstance,
  type EventFactory,
  type EventRegistrationStore,
} from "./event-instance.js";
import type { EventTraceSink, EventTraceTranscript } from "./event-trace.js";
import type { CanonicalClassId } from "./identity.js";
import type { ManagedStatus } from "./managed-lifecycle.js";
import {
  createListenerClass,
  type ListenerCallback,
  type ListenerClass,
  type ListenerInstance,
  type ListenerMiddleware,
} from "./listener-class.js";
import {
  ListenerRegistry,
  createListenerFactory,
  reactEndpoint,
  type ListenerClassRegistration,
  type ListenerFactory,
} from "./listener-runtime.js";
import {
  createLoaderNamespace,
  isRootNamespace,
  type QualifiedLoaderId,
} from "./namespace-identity.js";
import {
  markRuntimeOwned,
  type Runtime,
  type RuntimeOwned,
} from "./runtime.js";
import {
  createLoaderKind,
  TypedLoaderRegistry,
  type LoaderDefinition,
  type LoaderRegistration,
} from "./typed-loader-registry.js";
import { TypedNamespaceResolver } from "./typed-namespace-resolver.js";
import { TypedRegistry, type Registration } from "./typed-registry.js";
import { cloneJsonFromText, type JsonObject } from "./strict-json.js";

const eventDefinitions = createDefinitionKind<EventClass>("event");
const eventLoaders = createLoaderKind<EventClass>("event");
const eventRuntimes = new WeakMap<Runtime, EventRuntime>();
const eventLoaderDefinitions = new WeakSet<object>();
const MAX_RELAY_DEPTH = 32;

export type EventRelayMapper = (snapshot: JsonObject) => unknown;

export class RelayDepthError extends Error {
  constructor(
    readonly depth: number,
    readonly limit: number,
  ) {
    super(`Semantic relay depth ${depth} exceeds limit ${limit}.`);
    this.name = "RelayDepthError";
  }
}

export type EventLoaderBehavior = (
  requestedClassId: CanonicalClassId,
) => Iterable<EventClass> | Promise<Iterable<EventClass>>;

export interface EventLoaderDefinition {
  readonly namespace: string | undefined;
  readonly load: EventLoaderBehavior;
}

export interface EventLoaderRegistration extends RuntimeOwned {
  readonly id: QualifiedLoaderId;
  readonly namespace: string | undefined;
  readonly status: ManagedStatus;
  assertActive(operation: string): void;
}

export interface EventRuntimeOptions {
  readonly traceSink?: EventTraceSink;
  readonly lifecycleObserver?: ListenerLifecycleObserver;
}

export class DuplicateEventRuntimeError extends Error {
  constructor() {
    super("Runtime already has an event domain.");
    this.name = "DuplicateEventRuntimeError";
  }
}

export class InvalidEventLoaderDefinitionError extends TypeError {
  constructor() {
    super("Event loader definition lacks immutable helper provenance.");
    this.name = "InvalidEventLoaderDefinitionError";
  }
}

export function createEventLoader(
  namespace: string | undefined,
  load: EventLoaderBehavior,
): EventLoaderDefinition {
  createLoaderNamespace(namespace);
  if (typeof load !== "function") throw new InvalidEventLoaderDefinitionError();
  const definition = { namespace, load };
  eventLoaderDefinitions.add(definition);
  return Object.freeze(definition);
}

export interface EventRuntime {
  readonly runtime: Runtime;
  readonly factory: EventFactory;
  readonly defaultEndpoint: EventEndpoint;
  readonly listenerFactory: ListenerFactory;
  define(slug: string, schema: EventSchema): EventClass;
  register(eventClass: EventClass): EventClassRegistration;
  replace(eventClass: EventClass): Promise<EventClassRegistration>;
  unregister(classId: CanonicalClassId): Promise<void>;
  resolve(classId: CanonicalClassId): EventClassRegistration | undefined;
  load(classId: CanonicalClassId): Promise<EventClassRegistration>;
  create(
    source: CanonicalClassId | EventClassRegistration,
    payload: unknown,
    options?: EventCreateOptions,
  ): Promise<EventInstance>;
  dispatch(
    classId: CanonicalClassId,
    payload: unknown,
    options?: EventDispatchOptions,
  ): Promise<EventTraceTranscript>;
  createEndpoint(): Promise<EventEndpointPair>;
  publish(
    endpoint: EventEndpoint,
    classId: CanonicalClassId,
    payload: unknown,
    options?: EventDispatchOptions,
  ): Promise<EventTraceTranscript>;
  publishPrivate(
    endpoint: PrivateEventEndpoint,
    classId: CanonicalClassId,
    payload: unknown,
    options?: EventDispatchOptions,
  ): Promise<EventTraceTranscript>;
  defineListener(
    slug: string,
    eventClass: EventClass,
    callback: ListenerCallback,
    middleware?: Iterable<ListenerMiddleware>,
  ): ListenerClass;
  registerListener(listenerClass: ListenerClass): ListenerClassRegistration;
  replaceListener(
    listenerClass: ListenerClass,
  ): Promise<ListenerClassRegistration>;
  unregisterListener(classId: CanonicalClassId): Promise<void>;
  resolveListener(
    classId: CanonicalClassId,
  ): ListenerClassRegistration | undefined;
  listen(
    registration: ListenerClassRegistration,
    authority?: EventEndpoint | PrivateEventEndpoint,
  ): Promise<ListenerInstance>;
  relay(
    source: EventEndpoint | PrivateEventEndpoint,
    sourceEventClass: EventClass,
    target: EventEndpoint | PrivateEventEndpoint,
    targetClassId: CanonicalClassId,
    mapper: EventRelayMapper,
  ): Promise<ListenerInstance>;
  registerLoader(definition: EventLoaderDefinition): EventLoaderRegistration;
  replaceLoader(
    definition: EventLoaderDefinition,
  ): Promise<EventLoaderRegistration>;
  unregisterLoader(namespace?: string): Promise<void>;
}

class DefaultEventRuntime implements EventRuntime {
  readonly factory: EventFactory;
  readonly defaultEndpoint: EventEndpoint;
  readonly listenerFactory: ListenerFactory;
  readonly #factoryKernel: EventFactoryKernel;
  readonly #registry: TypedRegistry<EventClass>;
  readonly #loaders: TypedLoaderRegistry<EventClass>;
  readonly #resolver: TypedNamespaceResolver<EventClass>;
  readonly #dispatcher: EventDispatcher;
  readonly #listenerRegistry: ListenerRegistry;
  readonly #lifecycleObserver: ListenerLifecycleObserver | undefined;
  #nextRelaySequence = 0;
  readonly #classDefinitions = new WeakMap<
    EventClass,
    ClassDefinition<EventClass>
  >();
  readonly #definitionClasses = new WeakMap<
    ClassDefinition<EventClass>,
    EventClass
  >();
  readonly #classWrappers = new WeakMap<
    Registration<EventClass>,
    EventClassRegistration
  >();
  readonly #classRegistrations = new WeakMap<
    EventClassRegistration,
    Registration<EventClass>
  >();
  readonly #loaderWrappers = new WeakMap<
    LoaderRegistration<EventClass>,
    EventLoaderRegistration
  >();

  constructor(
    readonly runtime: Runtime,
    options: EventRuntimeOptions = {},
  ) {
    this.#registry = new TypedRegistry(runtime, eventDefinitions.kind);
    this.#loaders = new TypedLoaderRegistry(runtime, eventDefinitions.kind);
    this.#resolver = new TypedNamespaceResolver(this.#registry, this.#loaders);
    this.#lifecycleObserver = options.lifecycleObserver;
    this.#listenerRegistry = new ListenerRegistry(runtime);
    this.listenerFactory = createListenerFactory(
      runtime,
      this.#listenerRegistry,
      options.lifecycleObserver,
    );
    this.defaultEndpoint = createDefaultEventEndpoint(runtime).endpoint;
    const store: EventRegistrationStore = {
      retain: (registration) =>
        this.#registry.retain(this.#unwrap(registration)),
      releaseDependent: (registration) =>
        this.#registry.releaseDependent(this.#unwrap(registration)),
    };
    this.#factoryKernel = new EventFactoryKernel(runtime, store);
    const factoryKernel = this.#factoryKernel;
    this.factory = Object.freeze({
      runtime,
      create(
        registration: EventClassRegistration,
        payload: unknown,
        createOptions: EventCreateOptions = {},
      ) {
        return factoryKernel.create(registration, payload, createOptions);
      },
    });
    this.#dispatcher = new EventDispatcher(
      this.#factoryKernel,
      async (classId) => this.#wrap(await this.#resolver.load(classId)),
      options.traceSink,
      (event) =>
        reactEndpoint(this.defaultEndpoint, EventChannel.Public, event),
    );
  }

  define(slug: string, schema: EventSchema): EventClass {
    return createEventClass(slug, schema);
  }

  register(eventClass: EventClass): EventClassRegistration {
    return this.#wrap(this.#registry.register(this.#adaptClass(eventClass)));
  }

  async replace(eventClass: EventClass): Promise<EventClassRegistration> {
    return this.#wrap(
      await this.#registry.replace(this.#adaptClass(eventClass)),
    );
  }

  async unregister(classId: CanonicalClassId): Promise<void> {
    await this.#registry.unregister(classId);
  }

  resolve(classId: CanonicalClassId): EventClassRegistration | undefined {
    const registration = this.#registry.resolve(classId);
    return registration === undefined ? undefined : this.#wrap(registration);
  }

  async load(classId: CanonicalClassId): Promise<EventClassRegistration> {
    return this.#wrap(await this.#resolver.load(classId));
  }

  async create(
    source: CanonicalClassId | EventClassRegistration,
    payload: unknown,
    options: EventCreateOptions = {},
  ): Promise<EventInstance> {
    const registration =
      typeof source === "string" ? await this.load(source) : source;
    return this.factory.create(registration, payload, options);
  }

  dispatch(
    classId: CanonicalClassId,
    payload: unknown,
    options: EventDispatchOptions = {},
  ): Promise<EventTraceTranscript> {
    return this.#dispatcher.dispatch(classId, payload, options);
  }

  createEndpoint(): Promise<EventEndpointPair> {
    return createEventEndpoint(this.runtime, this.#lifecycleObserver);
  }

  publish(
    endpoint: EventEndpoint,
    classId: CanonicalClassId,
    payload: unknown,
    options: EventDispatchOptions = {},
  ): Promise<EventTraceTranscript> {
    assertEventEndpoint(this.runtime, endpoint);
    return this.#dispatcher.dispatch(classId, payload, options, (event) =>
      reactEndpoint(endpoint, EventChannel.Public, event),
    );
  }

  publishPrivate(
    authority: PrivateEventEndpoint,
    classId: CanonicalClassId,
    payload: unknown,
    options: EventDispatchOptions = {},
  ): Promise<EventTraceTranscript> {
    const endpoint = assertPrivateEventEndpoint(this.runtime, authority);
    return this.#dispatcher.dispatch(classId, payload, options, (event) =>
      reactEndpoint(endpoint, EventChannel.Private, event),
    );
  }

  defineListener(
    slug: string,
    eventClass: EventClass,
    callback: ListenerCallback,
    middleware: Iterable<ListenerMiddleware> = [],
  ): ListenerClass {
    return createListenerClass(slug, eventClass, callback, middleware);
  }

  registerListener(listenerClass: ListenerClass): ListenerClassRegistration {
    return this.#listenerRegistry.register(listenerClass);
  }

  replaceListener(
    listenerClass: ListenerClass,
  ): Promise<ListenerClassRegistration> {
    return this.#listenerRegistry.replace(listenerClass);
  }

  unregisterListener(classId: CanonicalClassId): Promise<void> {
    return this.#listenerRegistry.unregister(classId);
  }

  resolveListener(
    classId: CanonicalClassId,
  ): ListenerClassRegistration | undefined {
    return this.#listenerRegistry.resolve(classId);
  }

  listen(
    registration: ListenerClassRegistration,
    authority: EventEndpoint | PrivateEventEndpoint = this.defaultEndpoint,
  ): Promise<ListenerInstance> {
    return this.listenerFactory.create(registration, authority);
  }

  async relay(
    source: EventEndpoint | PrivateEventEndpoint,
    sourceEventClass: EventClass,
    target: EventEndpoint | PrivateEventEndpoint,
    targetClassId: CanonicalClassId,
    mapper: EventRelayMapper,
  ): Promise<ListenerInstance> {
    const targetAuthority = resolveEndpointAuthority(this.runtime, target);
    resolveEndpointAuthority(this.runtime, source);
    if (!isEventClass(sourceEventClass)) {
      throw new TypeError(
        "Relay source EventClass lacks immutable helper provenance.",
      );
    }
    if (typeof mapper !== "function") {
      throw new TypeError("Relay mapper is not a function.");
    }
    this.#nextRelaySequence += 1;
    const listenerClass = createListenerClass(
      `relay.item-${this.#nextRelaySequence}`,
      sourceEventClass,
      async ({ event }) => {
        resolveEndpointAuthority(this.runtime, target);
        const nextDepth = getEventRelayDepth(event) + 1;
        if (nextDepth > MAX_RELAY_DEPTH) {
          throw new RelayDepthError(nextDepth, MAX_RELAY_DEPTH);
        }
        const detached = cloneJsonFromText<JsonObject>(
          getEventSnapshotText(event),
        );
        const payload = await mapper(detached);
        await this.#dispatcher.dispatch(
          targetClassId,
          payload,
          {},
          (targetEvent) =>
            reactEndpoint(
              targetAuthority.endpoint,
              targetAuthority.channel,
              targetEvent,
            ),
          nextDepth,
        );
      },
    );
    const registration = this.registerListener(listenerClass);
    const relayFactory = createListenerFactory(
      this.runtime,
      this.#listenerRegistry,
      this.#lifecycleObserver,
      () => this.#listenerRegistry.unregister(listenerClass.id),
    );
    return relayFactory.create(registration, source);
  }

  registerLoader(definition: EventLoaderDefinition): EventLoaderRegistration {
    return this.#wrapLoader(
      this.#loaders.register(this.#adaptLoader(definition)),
    );
  }

  async replaceLoader(
    definition: EventLoaderDefinition,
  ): Promise<EventLoaderRegistration> {
    return this.#wrapLoader(
      await this.#loaders.replace(this.#adaptLoader(definition)),
    );
  }

  async unregisterLoader(namespace?: string): Promise<void> {
    await this.#loaders.unregister(createLoaderNamespace(namespace));
  }

  #adaptClass(eventClass: EventClass): ClassDefinition<EventClass> {
    if (!isEventClass(eventClass)) {
      throw new TypeError("EventClass lacks immutable helper provenance.");
    }
    let definition = this.#classDefinitions.get(eventClass);
    if (definition === undefined) {
      definition = eventDefinitions.define(
        eventClass.localSlug,
        () => eventClass,
      );
      this.#classDefinitions.set(eventClass, definition);
      this.#definitionClasses.set(definition, eventClass);
    }
    return definition;
  }

  #adaptLoader(
    definition: EventLoaderDefinition,
  ): LoaderDefinition<EventClass> {
    if (
      !eventLoaderDefinitions.has(definition) ||
      !Object.isFrozen(definition)
    ) {
      throw new InvalidEventLoaderDefinitionError();
    }
    return eventLoaders.define(definition.namespace, async (classId) => {
      const contribution = await definition.load(classId);
      const adapt = (eventClass: EventClass) => this.#adaptClass(eventClass);
      return {
        *[Symbol.iterator]() {
          for (const eventClass of contribution) yield adapt(eventClass);
        },
      };
    });
  }

  #wrap(registration: Registration<EventClass>): EventClassRegistration {
    let wrapper = this.#classWrappers.get(registration);
    if (wrapper !== undefined) return wrapper;
    const definitionClasses = this.#definitionClasses;
    wrapper = Object.freeze(
      markRuntimeOwned(this.runtime, {
        id: registration.id,
        classId: registration.classId,
        get status() {
          return registration.status;
        },
        get eventClass() {
          registration.assertActive("read its EventClass");
          const eventClass = definitionClasses.get(registration.definition);
          if (eventClass === undefined)
            throw new TypeError("Registration has no EventClass.");
          return eventClass;
        },
        assertActive(operation: string) {
          registration.assertActive(operation);
        },
      }),
    );
    this.#classWrappers.set(registration, wrapper);
    this.#classRegistrations.set(wrapper, registration);
    return wrapper;
  }

  #unwrap(wrapper: EventClassRegistration): Registration<EventClass> {
    this.runtime.assertOwns(wrapper);
    const registration = this.#classRegistrations.get(wrapper);
    if (registration === undefined) {
      throw new TypeError(
        "EventClassRegistration does not belong to this event domain.",
      );
    }
    return registration;
  }

  #wrapLoader(
    registration: LoaderRegistration<EventClass>,
  ): EventLoaderRegistration {
    let wrapper = this.#loaderWrappers.get(registration);
    if (wrapper !== undefined) return wrapper;
    wrapper = Object.freeze(
      markRuntimeOwned(this.runtime, {
        id: registration.id,
        namespace: isRootNamespace(registration.namespace)
          ? undefined
          : String(registration.namespace),
        get status() {
          return registration.status;
        },
        assertActive(operation: string) {
          registration.assertActive(operation);
        },
      }),
    );
    this.#loaderWrappers.set(registration, wrapper);
    return wrapper;
  }
}

export function createEventRuntime(
  runtime: Runtime,
  options: EventRuntimeOptions = {},
): EventRuntime {
  if (eventRuntimes.has(runtime)) throw new DuplicateEventRuntimeError();
  const eventRuntime = new DefaultEventRuntime(runtime, options);
  const immutableEventRuntime = Object.freeze(eventRuntime);
  eventRuntimes.set(runtime, immutableEventRuntime);
  return immutableEventRuntime;
}
