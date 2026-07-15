import { describe, expect, it } from "vitest";

import {
  DuplicatePluginInstallationError,
  EventChannel,
  ListenerLifecyclePhase,
  PluginInstallationError,
  PluginLifecyclePhase,
  PluginOperationConflictError,
  PluginUninstallDependencyError,
  createEventRuntime,
  createRuntime,
  eventField,
  type PluginLifecycleRecord,
} from "../src/index.js";
import { OwnershipError } from "../src/runtime-errors.js";

function definePopulatedPlugin(
  events: ReturnType<typeof createEventRuntime>,
  received: string[] = [],
) {
  const eventClass = events.define("plugin.message", {
    value: eventField((value) => typeof value === "string"),
  });
  const listenerClass = events.defineListener(
    "plugin.capture",
    eventClass,
    ({ event }) => {
      received.push(event.snapshot.value as string);
    },
  );
  const plugin = events.definePlugin("sample", (builder) => {
    builder.addEvent(eventClass);
    builder.addListener(listenerClass);
    builder.bindListener(listenerClass, events.defaultEndpoint);
  });
  return { eventClass, listenerClass, plugin };
}

describe("plugin transactions", () => {
  it("installs an empty plugin and permits reinstall after release", async () => {
    const events = createEventRuntime(createRuntime({ id: "app" }));
    const plugin = events.definePlugin("empty", () => undefined);

    const first = await events.installPlugin(plugin);
    expect(first.id).toBe("app::plugin-installation-instance/installation-1");
    expect(first.pluginClassId).toBe("plugin/empty");
    expect(first.status).toBe("active");
    await events.uninstallPlugin(first);
    expect(first.status).toBe("released");

    const second = await events.installPlugin(plugin);
    expect(second.id).toBe("app::plugin-installation-instance/installation-2");
  });

  it("publishes a complete contribution graph and cascade removes it", async () => {
    const received: string[] = [];
    const events = createEventRuntime(createRuntime({ id: "app" }));
    const { eventClass, listenerClass, plugin } = definePopulatedPlugin(
      events,
      received,
    );

    const installation = await events.installPlugin(plugin);
    expect(events.resolve(eventClass.id)?.eventClass).toBe(eventClass);
    expect(events.resolveListener(listenerClass.id)?.listenerClass).toBe(
      listenerClass,
    );
    await events.dispatch(eventClass.id, { value: "seen" });
    expect(received).toEqual(["seen"]);

    await expect(events.uninstallPlugin(installation)).rejects.toBeInstanceOf(
      PluginUninstallDependencyError,
    );
    await events.cascadeUninstallPlugin(installation);
    expect(events.resolve(eventClass.id)).toBeUndefined();
    expect(events.resolveListener(listenerClass.id)).toBeUndefined();
    expect(installation.status).toBe("released");
  });

  it("rejects duplicate installation before contribution execution", async () => {
    const events = createEventRuntime(createRuntime({ id: "app" }));
    let calls = 0;
    const plugin = events.definePlugin("single", () => {
      calls += 1;
    });
    await events.installPlugin(plugin);

    await expect(events.installPlugin(plugin)).rejects.toBeInstanceOf(
      DuplicatePluginInstallationError,
    );
    expect(calls).toBe(1);
  });

  it("rejects conflicts and unavailable listener events before mutation", async () => {
    const events = createEventRuntime(createRuntime({ id: "app" }));
    const eventClass = events.define("conflict.event", {});
    events.register(eventClass);
    const conflict = events.definePlugin("conflict", (builder) => {
      builder.addEvent(eventClass);
    });
    await expect(events.installPlugin(conflict)).rejects.toBeInstanceOf(
      PluginInstallationError,
    );
    expect(events.resolve(eventClass.id)?.eventClass).toBe(eventClass);

    const absent = events.define("absent.event", {});
    const listener = events.defineListener(
      "absent.listener",
      absent,
      () => undefined,
    );
    const invalid = events.definePlugin("invalid", (builder) => {
      builder.addListener(listener);
    });
    await expect(events.installPlugin(invalid)).rejects.toBeInstanceOf(
      PluginInstallationError,
    );
    expect(events.resolveListener(listener.id)).toBeUndefined();
  });

  it("rolls back all registrations when installed observation fails", async () => {
    const cause = new Error("observer failed");
    const records: PluginLifecycleRecord[] = [];
    const events = createEventRuntime(createRuntime({ id: "app" }), {
      pluginLifecycleObserver(record) {
        records.push(record);
        expect(Object.isFrozen(record)).toBe(true);
        if (record.phase === PluginLifecyclePhase.Installed) throw cause;
      },
    });
    const { eventClass, listenerClass, plugin } = definePopulatedPlugin(events);

    const failure = await events
      .installPlugin(plugin)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PluginInstallationError);
    expect(failure).toMatchObject({ cause });
    expect(events.resolve(eventClass.id)).toBeUndefined();
    expect(events.resolveListener(listenerClass.id)).toBeUndefined();
    expect(records.map(({ phase }) => phase)).toEqual([
      PluginLifecyclePhase.Installed,
      PluginLifecyclePhase.Rollback,
    ]);
  });

  it("rolls back earlier bindings when a later activation fails", async () => {
    const events = createEventRuntime(createRuntime({ id: "app" }), {
      lifecycleObserver(record) {
        if (
          record.phase === ListenerLifecyclePhase.ListenerInstalled &&
          record.listenerClassId === "listener/plugin.second"
        ) {
          throw new Error("second activation failed");
        }
      },
    });
    const eventClass = events.define("plugin.activation", {});
    const first = events.defineListener(
      "plugin.first",
      eventClass,
      () => undefined,
    );
    const second = events.defineListener(
      "plugin.second",
      eventClass,
      () => undefined,
    );
    const plugin = events.definePlugin("activation", (builder) => {
      builder.addEvent(eventClass);
      builder.addListener(first);
      builder.addListener(second);
      builder.bindListener(first, events.defaultEndpoint);
      builder.bindListener(second, events.defaultEndpoint);
    });

    await expect(events.installPlugin(plugin)).rejects.toBeInstanceOf(
      PluginInstallationError,
    );
    expect(events.resolve(eventClass.id)).toBeUndefined();
    expect(events.resolveListener(first.id)).toBeUndefined();
    expect(events.resolveListener(second.id)).toBeUndefined();
  });

  it("revalidates endpoint authority after asynchronous staging", async () => {
    const events = createEventRuntime(createRuntime({ id: "app" }));
    const pair = await events.createEndpoint();
    let continueContribution: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      continueContribution = resolve;
    });
    const eventClass = events.define("plugin.endpoint", {});
    const listener = events.defineListener(
      "plugin.endpoint-listener",
      eventClass,
      () => undefined,
    );
    const plugin = events.definePlugin("endpoint-race", async (builder) => {
      builder.addEvent(eventClass);
      builder.addListener(listener);
      builder.bindListener(listener, pair.endpoint);
      await barrier;
    });
    const installing = events.installPlugin(plugin);
    await pair.privateEndpoint.release();
    continueContribution?.();

    await expect(installing).rejects.toBeInstanceOf(PluginInstallationError);
    expect(events.resolve(eventClass.id)).toBeUndefined();
    expect(events.resolveListener(listener.id)).toBeUndefined();
  });

  it("preserves external dependents during explicit cascade", async () => {
    const events = createEventRuntime(createRuntime({ id: "app" }));
    const { eventClass, plugin } = definePopulatedPlugin(events);
    const installation = await events.installPlugin(plugin);
    const external = await events.create(eventClass.id, { value: "held" });

    const failure = await events
      .cascadeUninstallPlugin(installation)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PluginUninstallDependencyError);
    expect(events.resolve(eventClass.id)).toBeDefined();
    expect(installation.status).toBe("active");

    await external.release();
    await events.cascadeUninstallPlugin(installation);
  });

  it("deduplicates same-mode operations and rejects conflicting authority", async () => {
    let releaseObserver: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      releaseObserver = resolve;
    });
    const events = createEventRuntime(createRuntime({ id: "app" }), {
      pluginLifecycleObserver(record) {
        if (record.phase === PluginLifecyclePhase.Uninstalling) return barrier;
      },
    });
    const installation = await events.installPlugin(
      events.definePlugin("gated", () => undefined),
    );

    const first = events.uninstallPlugin(installation);
    const second = events.uninstallPlugin(installation);
    expect(second).toBe(first);
    expect(() => events.cascadeUninstallPlugin(installation)).toThrow(
      PluginOperationConflictError,
    );
    releaseObserver?.();
    await first;
    await expect(events.uninstallPlugin(installation)).resolves.toBeUndefined();
  });

  it("blocks dependent admission while uninstall lifecycle awaits", async () => {
    let continueUninstall: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      continueUninstall = resolve;
    });
    const events = createEventRuntime(createRuntime({ id: "app" }), {
      pluginLifecycleObserver(record) {
        if (record.phase === PluginLifecyclePhase.Uninstalling) return barrier;
        return false;
      },
    });
    const eventClass = events.define("plugin.leased", {});
    const plugin = events.definePlugin("leased", (builder) => {
      builder.addEvent(eventClass);
    });
    const installation = await events.installPlugin(plugin);
    const uninstalling = events.uninstallPlugin(installation);

    const admissionFailure = await events
      .create(eventClass.id, {})
      .catch((error: unknown) => error);
    expect(admissionFailure).toHaveProperty(
      "message",
      expect.stringContaining("not accepting new dependents"),
    );
    continueUninstall?.();
    await uninstalling;
  });

  it("reports owned listener cleanup failure without withdrawing registrations", async () => {
    let failRelease = true;
    const events = createEventRuntime(createRuntime({ id: "app" }), {
      lifecycleObserver(record) {
        if (
          failRelease &&
          record.phase === ListenerLifecyclePhase.ListenerReleased
        ) {
          throw new Error("listener cleanup failed");
        }
      },
    });
    const { eventClass, listenerClass, plugin } = definePopulatedPlugin(events);
    const installation = await events.installPlugin(plugin);

    await expect(
      events.cascadeUninstallPlugin(installation),
    ).rejects.toBeInstanceOf(Error);
    expect(events.resolve(eventClass.id)).toBeDefined();
    expect(events.resolveListener(listenerClass.id)).toBeDefined();
    expect(installation.status).toBe("active");

    failRelease = false;
    await events.cascadeUninstallPlugin(installation);
  });

  it("isolates portable definitions and rejects foreign disposal authority", async () => {
    const first = createEventRuntime(createRuntime({ id: "first" }));
    const second = createEventRuntime(createRuntime({ id: "second" }));
    const plugin = first.definePlugin("portable", () => undefined);
    const firstInstallation = await first.installPlugin(plugin);
    const secondInstallation = await second.installPlugin(plugin);
    expect(firstInstallation.id).not.toBe(secondInstallation.id);

    expect(() => second.uninstallPlugin(firstInstallation)).toThrow(
      OwnershipError,
    );
    await first.uninstallPlugin(firstInstallation);
    await second.uninstallPlugin(secondInstallation);
  });

  it("uses public endpoint channel semantics for installation-owned bindings", async () => {
    const channels: string[] = [];
    const events = createEventRuntime(createRuntime({ id: "app" }), {
      lifecycleObserver(record) {
        if (record.channel !== undefined) channels.push(record.channel);
      },
    });
    const { plugin } = definePopulatedPlugin(events);
    const installation = await events.installPlugin(plugin);
    expect(channels).toContain(EventChannel.Public);
    await events.cascadeUninstallPlugin(installation);
  });
});
