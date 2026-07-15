import { isEventClass, type EventClass } from "./event-class.js";
import type { EventEndpoint, PrivateEventEndpoint } from "./event-endpoint.js";
import {
  createCanonicalClassId,
  createLocalClassSlug,
  createManagedInstanceId,
  type CanonicalClassId,
  type LocalClassSlug,
  type ManagedInstanceId,
} from "./identity.js";
import { isListenerClass, type ListenerClass } from "./listener-class.js";
import type { Runtime } from "./runtime.js";

export const PluginLifecyclePhase = {
  Installed: "installed",
  Uninstalling: "uninstalling",
  Released: "released",
  Rollback: "rollback",
} as const;
export type PluginLifecyclePhase =
  (typeof PluginLifecyclePhase)[keyof typeof PluginLifecyclePhase];

export interface PluginLifecycleRecord {
  readonly installationId: ManagedInstanceId;
  readonly pluginClassId: CanonicalClassId;
  readonly phase: PluginLifecyclePhase;
  readonly sequence: number;
  readonly timestamp: number;
}

export type PluginLifecycleObserver = (
  record: PluginLifecycleRecord,
) => unknown;

export const PluginStagingLimits = Object.freeze({
  events: 100,
  listeners: 100,
  bindings: 100,
});

export interface PluginContributionBuilder {
  addEvent(eventClass: EventClass): void;
  addListener(listenerClass: ListenerClass): void;
  bindListener(
    listenerClass: ListenerClass,
    authority: EventEndpoint | PrivateEventEndpoint,
  ): void;
}

export type PluginContribution = (
  builder: PluginContributionBuilder,
) => unknown;

export interface PluginClass {
  readonly id: CanonicalClassId;
  readonly localSlug: LocalClassSlug;
  readonly contribute: PluginContribution;
}

export interface StagedPluginBinding {
  readonly listenerClass: ListenerClass;
  readonly authority: EventEndpoint | PrivateEventEndpoint;
}

export interface StagedPluginContributions {
  readonly events: readonly EventClass[];
  readonly listeners: readonly ListenerClass[];
  readonly bindings: readonly StagedPluginBinding[];
}

export class PluginDefinitionError extends TypeError {
  constructor(readonly reason: string) {
    super(`Invalid plugin definition: ${reason}.`);
    this.name = "PluginDefinitionError";
  }
}

export class PluginStagingError extends Error {
  constructor(readonly reason: string) {
    super(`Plugin contribution staging failed: ${reason}.`);
    this.name = "PluginStagingError";
  }
}

export class PluginInstallationError extends Error {
  readonly rollbackFailures: readonly unknown[];
  constructor(cause: unknown, rollbackFailures: readonly unknown[]) {
    super("Plugin installation failed.", { cause });
    this.name = "PluginInstallationError";
    this.rollbackFailures = Object.freeze([...rollbackFailures]);
  }
}

export class DuplicatePluginInstallationError extends Error {
  constructor(readonly pluginClassId: CanonicalClassId) {
    super(`PluginClass ${JSON.stringify(pluginClassId)} is already installed.`);
    this.name = "DuplicatePluginInstallationError";
  }
}

export class PluginUninstallError extends Error {
  readonly failures: readonly unknown[];
  constructor(failures: readonly unknown[]) {
    super("Plugin uninstall cleanup failed.");
    this.name = "PluginUninstallError";
    this.failures = Object.freeze([...failures]);
  }
}

export class PluginUninstallDependencyError extends Error {
  constructor(
    readonly dependencies: readonly Readonly<{
      classId: CanonicalClassId;
      dependents: number;
    }>[],
  ) {
    super("Plugin uninstall is blocked by live registration dependents.");
    this.name = "PluginUninstallDependencyError";
    this.dependencies = Object.freeze(
      dependencies.map((dependency) => Object.freeze({ ...dependency })),
    );
  }
}

export class PluginOperationConflictError extends Error {
  constructor() {
    super("A conflicting plugin installation operation is already active.");
    this.name = "PluginOperationConflictError";
  }
}

const pluginClasses = new WeakSet<object>();
const runtimeInstallationSequences = new WeakMap<Runtime, number>();

export function createPluginClass(
  slug: string,
  contribute: PluginContribution,
): PluginClass {
  if (typeof contribute !== "function") {
    throw new PluginDefinitionError("contribution callback is not a function");
  }
  const localSlug = createLocalClassSlug(slug);
  const pluginClass = {
    id: createCanonicalClassId("plugin", localSlug),
    localSlug,
    contribute,
  };
  pluginClasses.add(pluginClass);
  return Object.freeze(pluginClass);
}

export function isPluginClass(value: unknown): value is PluginClass {
  return (
    typeof value === "object" &&
    value !== null &&
    pluginClasses.has(value) &&
    Object.isFrozen(value)
  );
}

export function allocatePluginInstallationId(
  runtime: Runtime,
): ManagedInstanceId {
  const next = (runtimeInstallationSequences.get(runtime) ?? 0) + 1;
  runtimeInstallationSequences.set(runtime, next);
  return createManagedInstanceId(
    runtime.id,
    "plugin-installation",
    `installation-${next}`,
  );
}

export async function stagePluginContributions(
  pluginClass: PluginClass,
): Promise<StagedPluginContributions> {
  if (!isPluginClass(pluginClass)) {
    throw new PluginDefinitionError("PluginClass lacks helper provenance");
  }
  const events: EventClass[] = [];
  const listeners: ListenerClass[] = [];
  const bindings: StagedPluginBinding[] = [];
  const eventIds = new Set<CanonicalClassId>();
  const listenerIds = new Set<CanonicalClassId>();
  const bindingAuthorities = new WeakMap<ListenerClass, WeakSet<object>>();
  let active = true;
  const assertActive = () => {
    if (!active) throw new PluginStagingError("builder is no longer active");
  };
  const builder: PluginContributionBuilder = Object.freeze({
    addEvent(eventClass: EventClass) {
      assertActive();
      if (!isEventClass(eventClass)) {
        throw new PluginStagingError("EventClass lacks helper provenance");
      }
      assertCapacity(events, PluginStagingLimits.events, "event definitions");
      if (eventIds.has(eventClass.id)) {
        throw new PluginStagingError(`duplicate EventClass ${eventClass.id}`);
      }
      eventIds.add(eventClass.id);
      events.push(eventClass);
    },
    addListener(listenerClass: ListenerClass) {
      assertActive();
      if (!isListenerClass(listenerClass)) {
        throw new PluginStagingError("ListenerClass lacks helper provenance");
      }
      assertCapacity(
        listeners,
        PluginStagingLimits.listeners,
        "listener definitions",
      );
      if (listenerIds.has(listenerClass.id)) {
        throw new PluginStagingError(
          `duplicate ListenerClass ${listenerClass.id}`,
        );
      }
      listenerIds.add(listenerClass.id);
      listeners.push(listenerClass);
    },
    bindListener(
      listenerClass: ListenerClass,
      authority: EventEndpoint | PrivateEventEndpoint,
    ) {
      assertActive();
      if (!isListenerClass(listenerClass)) {
        throw new PluginStagingError("binding ListenerClass lacks provenance");
      }
      if (typeof authority !== "object" || authority === null) {
        throw new PluginStagingError("binding authority is not an object");
      }
      assertCapacity(bindings, PluginStagingLimits.bindings, "bindings");
      let authorities = bindingAuthorities.get(listenerClass);
      if (authorities === undefined) {
        authorities = new WeakSet();
        bindingAuthorities.set(listenerClass, authorities);
      }
      if (authorities.has(authority)) {
        throw new PluginStagingError(
          `duplicate binding for ${listenerClass.id}`,
        );
      }
      authorities.add(authority);
      bindings.push(Object.freeze({ listenerClass, authority }));
    },
  });

  try {
    await pluginClass.contribute(builder);
  } finally {
    active = false;
  }
  return Object.freeze({
    events: Object.freeze(events),
    listeners: Object.freeze(listeners),
    bindings: Object.freeze(bindings),
  });
}

function assertCapacity(
  values: readonly unknown[],
  limit: number,
  kind: string,
): void {
  if (values.length === limit) {
    throw new PluginStagingError(`${kind} exceed limit ${limit}`);
  }
}
