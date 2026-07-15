import type { EventClass } from "./event-class.js";
import { resolveEndpointAuthority } from "./event-endpoint.js";
import type { EventClassRegistration } from "./event-instance.js";
import type { CanonicalClassId, ManagedInstanceId } from "./identity.js";
import type { ListenerInstance } from "./listener-class.js";
import {
  type ListenerClassRegistration,
  type ListenerFactory,
  type ListenerRegistry,
} from "./listener-runtime.js";
import {
  createManagedResource,
  type ManagedStatus,
  type ManagedTombstone,
} from "./managed-lifecycle.js";
import {
  allocatePluginInstallationId,
  createPluginClass,
  DuplicatePluginInstallationError,
  isPluginClass,
  PluginDefinitionError,
  PluginInstallationError,
  PluginLifecyclePhase,
  PluginOperationConflictError,
  PluginUninstallDependencyError,
  PluginUninstallError,
  stagePluginContributions,
  type PluginClass,
  type PluginLifecycleObserver,
  type PluginLifecycleRecord,
  type StagedPluginContributions,
} from "./plugin-class.js";
import { ManagedReleaseError } from "./runtime-errors.js";
import { RegistrationWithdrawalError } from "./registration-errors.js";
import {
  markRuntimeOwned,
  type Runtime,
  type RuntimeOwned,
} from "./runtime.js";
import { createJsonSnapshot } from "./strict-json.js";

export interface PluginInstallation extends RuntimeOwned {
  readonly id: ManagedInstanceId;
  readonly pluginClassId: CanonicalClassId;
  readonly status: ManagedStatus;
  readonly tombstone: ManagedTombstone | undefined;
  assertActive(operation: string): void;
}

export interface PluginEventTransactionPort {
  resolve(classId: CanonicalClassId): EventClassRegistration | undefined;
  registerBatch(
    eventClasses: Iterable<EventClass>,
  ): Promise<readonly EventClassRegistration[]>;
  dependentCount(registration: EventClassRegistration): number;
  acquireAdmissionLease(
    registrations: Iterable<EventClassRegistration>,
  ): () => void;
  withdrawExact(registrations: Iterable<EventClassRegistration>): Promise<void>;
}

interface InstallationState {
  pluginClass: PluginClass | undefined;
  eventRegistrations: readonly EventClassRegistration[];
  listenerRegistrations: readonly ListenerClassRegistration[];
  ownedListeners: readonly ListenerInstance[];
  operation?: { mode: UninstallMode; promise: Promise<void> };
}

type UninstallMode = "protected" | "cascade";

const installationStates = new WeakMap<PluginInstallation, InstallationState>();

export class PluginDomain {
  readonly #active = new Map<CanonicalClassId, PluginInstallation | true>();
  readonly #events: PluginEventTransactionPort;
  readonly #listeners: ListenerRegistry;
  readonly #listenerFactory: ListenerFactory;
  readonly #observer: PluginLifecycleObserver | undefined;
  #lifecycleSequence = 0;

  constructor(
    readonly runtime: Runtime,
    events: PluginEventTransactionPort,
    listeners: ListenerRegistry,
    listenerFactory: ListenerFactory,
    observer?: PluginLifecycleObserver,
  ) {
    this.#events = events;
    this.#listeners = listeners;
    this.#listenerFactory = listenerFactory;
    this.#observer = observer;
  }

  define(slug: string, contribute: PluginClass["contribute"]): PluginClass {
    return createPluginClass(slug, contribute);
  }

  async install(pluginClass: PluginClass): Promise<PluginInstallation> {
    if (!isPluginClass(pluginClass)) {
      throw new PluginDefinitionError("PluginClass lacks helper provenance");
    }
    if (this.#active.has(pluginClass.id)) {
      throw new DuplicatePluginInstallationError(pluginClass.id);
    }
    this.#active.set(pluginClass.id, true);
    const installationId = allocatePluginInstallationId(this.runtime);
    let staged: StagedPluginContributions | undefined;
    let eventRegistrations: readonly EventClassRegistration[] = [];
    let listenerRegistrations: readonly ListenerClassRegistration[] = [];
    const ownedListeners: ListenerInstance[] = [];
    const rollbackFailures: unknown[] = [];
    let installationResource: { release(): Promise<void> } | undefined;
    try {
      staged = await stagePluginContributions(pluginClass);
      this.#validate(staged);

      const eventCommit = this.#events.registerBatch(staged.events);
      const listenerCommit = this.#listeners.registerBatch(staged.listeners);
      eventRegistrations = staged.events
        .map((eventClass) => this.#events.resolve(eventClass.id))
        .filter(isPresent);
      listenerRegistrations = staged.listeners
        .map((listenerClass) => this.#listeners.resolve(listenerClass.id))
        .filter(isPresent);

      const bindingPromises = staged.bindings.map((binding) => {
        resolveEndpointAuthority(this.runtime, binding.authority);
        const registration = this.#listeners.resolve(binding.listenerClass.id);
        if (registration === undefined) {
          throw new TypeError("Prepared listener registration is unavailable.");
        }
        return this.#listenerFactory.create(registration, binding.authority);
      });

      eventRegistrations = await eventCommit;
      listenerRegistrations = await listenerCommit;
      const bindingResults = await Promise.allSettled(bindingPromises);
      const failedBinding = bindingResults.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      ownedListeners.push(
        ...bindingResults
          .filter(
            (result): result is PromiseFulfilledResult<ListenerInstance> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value),
      );
      if (failedBinding !== undefined) throw failedBinding.reason;

      const resource = createManagedResource(
        this.runtime,
        installationId,
        pluginClass.id,
      );
      const state: InstallationState = {
        pluginClass,
        eventRegistrations,
        listenerRegistrations,
        ownedListeners: Object.freeze([...ownedListeners]),
      };
      resource.addCleanup(() => {
        state.pluginClass = undefined;
        state.eventRegistrations = [];
        state.listenerRegistrations = [];
        state.ownedListeners = [];
        this.#active.delete(pluginClass.id);
      });
      const installation = Object.freeze(
        markRuntimeOwned(this.runtime, {
          id: resource.object.id,
          pluginClassId: pluginClass.id,
          get status() {
            return resource.object.status;
          },
          get tombstone() {
            return resource.object.tombstone;
          },
          assertActive(operation: string) {
            resource.object.assertActive(operation);
          },
        }),
      );
      installationResource = resource.object;
      installationResources.set(installation, resource.object);
      installationStates.set(installation, state);
      await this.#emit(
        installationId,
        pluginClass.id,
        PluginLifecyclePhase.Installed,
      );
      this.#active.set(pluginClass.id, installation);
      return installation;
    } catch (cause) {
      for (const listener of [...ownedListeners].reverse()) {
        await collectRelease(listener, rollbackFailures);
      }
      await collectOperation(
        () => this.#listeners.withdrawExact(listenerRegistrations),
        rollbackFailures,
      );
      await collectOperation(
        () => this.#events.withdrawExact(eventRegistrations),
        rollbackFailures,
      );
      if (installationResource !== undefined) {
        await collectRelease(installationResource, rollbackFailures);
      }
      await collectOperation(
        () =>
          this.#emit(
            installationId,
            pluginClass.id,
            PluginLifecyclePhase.Rollback,
          ),
        rollbackFailures,
      );
      this.#active.delete(pluginClass.id);
      throw new PluginInstallationError(cause, rollbackFailures);
    }
  }

  uninstall(installation: PluginInstallation): Promise<void> {
    return this.#beginUninstall(installation, "protected");
  }

  cascadeUninstall(installation: PluginInstallation): Promise<void> {
    return this.#beginUninstall(installation, "cascade");
  }

  #beginUninstall(
    installation: PluginInstallation,
    mode: UninstallMode,
  ): Promise<void> {
    this.runtime.assertOwns(installation);
    const state = installationStates.get(installation);
    if (state === undefined) {
      throw new TypeError(
        "PluginInstallation does not belong to this plugin domain.",
      );
    }
    if (installation.status === "released") return Promise.resolve();
    if (state.operation !== undefined) {
      if (state.operation.mode === mode) return state.operation.promise;
      throw new PluginOperationConflictError();
    }
    const promise = this.#executeUninstall(installation, state, mode);
    state.operation = { mode, promise };
    void promise
      .finally(() => {
        if (state.operation?.promise === promise) delete state.operation;
      })
      .catch(() => undefined);
    return promise;
  }

  async #executeUninstall(
    installation: PluginInstallation,
    state: InstallationState,
    mode: UninstallMode,
  ): Promise<void> {
    installation.assertActive("uninstall the plugin");
    const releaseListenerLease = this.#listeners.acquireAdmissionLease(
      state.listenerRegistrations,
    );
    let releaseEventLease: (() => void) | undefined;
    try {
      releaseEventLease = this.#events.acquireAdmissionLease(
        state.eventRegistrations,
      );
      if (mode === "cascade") {
        const ownedFailures: unknown[] = [];
        for (const listener of [...state.ownedListeners].reverse()) {
          if (listener.status === "released") continue;
          await collectRelease(listener, ownedFailures);
        }
        if (ownedFailures.length > 0)
          throw new PluginUninstallError(ownedFailures);
      }
      const dependencies = this.#dependencies(state);
      if (dependencies.length > 0) {
        throw new PluginUninstallDependencyError(dependencies);
      }

      const failures: unknown[] = [];
      await collectOperation(
        () =>
          this.#emit(
            installation.id,
            installation.pluginClassId,
            PluginLifecyclePhase.Uninstalling,
          ),
        failures,
      );
      const listenerWithdrawal = this.#listeners.withdrawExact(
        state.listenerRegistrations,
      );
      const eventWithdrawal = this.#events.withdrawExact(
        state.eventRegistrations,
      );
      await collectOperation(() => listenerWithdrawal, failures);
      await collectOperation(() => eventWithdrawal, failures);
      await collectOperation(
        () =>
          this.#emit(
            installation.id,
            installation.pluginClassId,
            PluginLifecyclePhase.Released,
          ),
        failures,
      );
      const resource = getInstallationResource(installation);
      await collectOperation(() => resource.release(), failures);
      if (failures.length > 0) throw new PluginUninstallError(failures);
    } finally {
      releaseEventLease?.();
      releaseListenerLease();
    }
  }

  #dependencies(state: InstallationState) {
    const dependencies: Array<{
      classId: CanonicalClassId;
      dependents: number;
    }> = [];
    for (const registration of state.listenerRegistrations) {
      const dependents = this.#listeners.dependentCount(registration);
      if (dependents > 0)
        dependencies.push({ classId: registration.classId, dependents });
    }
    for (const registration of state.eventRegistrations) {
      const dependents = this.#events.dependentCount(registration);
      if (dependents > 0)
        dependencies.push({ classId: registration.classId, dependents });
    }
    return dependencies;
  }

  #validate(staged: StagedPluginContributions): void {
    const eventIds = new Set(staged.events.map((eventClass) => eventClass.id));
    const listenerIds = new Set(
      staged.listeners.map((listenerClass) => listenerClass.id),
    );
    for (const eventClass of staged.events) {
      if (this.#events.resolve(eventClass.id) !== undefined) {
        throw new PluginDefinitionError(
          `EventClass ${eventClass.id} is already registered`,
        );
      }
    }
    for (const listenerClass of staged.listeners) {
      if (this.#listeners.resolve(listenerClass.id) !== undefined) {
        throw new PluginDefinitionError(
          `ListenerClass ${listenerClass.id} is already registered`,
        );
      }
      if (
        !eventIds.has(listenerClass.eventClass.id) &&
        this.#events.resolve(listenerClass.eventClass.id) === undefined
      ) {
        throw new PluginDefinitionError(
          `EventClass ${listenerClass.eventClass.id} is unavailable`,
        );
      }
    }
    for (const binding of staged.bindings) {
      if (!listenerIds.has(binding.listenerClass.id)) {
        throw new PluginDefinitionError(
          `binding ${binding.listenerClass.id} is not contributed`,
        );
      }
      resolveEndpointAuthority(this.runtime, binding.authority);
    }
  }

  async #emit(
    installationId: ManagedInstanceId,
    pluginClassId: CanonicalClassId,
    phase: PluginLifecyclePhase,
  ): Promise<void> {
    if (this.#observer === undefined) return;
    this.#lifecycleSequence += 1;
    const record = createJsonSnapshot({
      installationId,
      pluginClassId,
      phase,
      sequence: this.#lifecycleSequence,
      timestamp: Date.now(),
    }).value as unknown as PluginLifecycleRecord;
    await this.#observer(record);
  }
}

const installationResources = new WeakMap<
  PluginInstallation,
  { release(): Promise<void> }
>();

function getInstallationResource(installation: PluginInstallation) {
  const resource = installationResources.get(installation);
  if (resource === undefined)
    throw new TypeError("PluginInstallation has no managed resource.");
  return resource;
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

async function collectRelease(
  resource: { release(): Promise<void> },
  failures: unknown[],
): Promise<void> {
  await collectOperation(() => resource.release(), failures);
}

async function collectOperation(
  operation: () => void | Promise<void>,
  failures: unknown[],
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (
      error instanceof ManagedReleaseError ||
      error instanceof RegistrationWithdrawalError
    ) {
      failures.push(...error.failures);
    } else failures.push(error);
  }
}
