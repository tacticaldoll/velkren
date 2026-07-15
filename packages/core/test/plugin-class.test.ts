import { describe, expect, it } from "vitest";

import { createEventClass, eventField } from "../src/event-class.js";
import { createEventEndpoint } from "../src/event-endpoint.js";
import { createEventRuntime } from "../src/event-runtime.js";
import { createListenerClass } from "../src/listener-class.js";
import {
  PluginDefinitionError,
  PluginStagingError,
  PluginStagingLimits,
  allocatePluginInstallationId,
  createPluginClass,
  isPluginClass,
  stagePluginContributions,
  type PluginContributionBuilder,
} from "../src/plugin-class.js";
import { createRuntime } from "../src/runtime.js";

const eventClass = createEventClass("plugin.saved", {
  value: eventField((value) => typeof value === "string"),
});
const listenerClass = createListenerClass(
  "plugin.audit",
  eventClass,
  () => undefined,
);

describe("PluginClass definitions and contribution staging", () => {
  it("creates portable immutable helper-proven definitions", () => {
    const plugin = createPluginClass("editor.core", () => undefined);

    expect(plugin.id).toBe("plugin/editor.core");
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(isPluginClass(plugin)).toBe(true);
    expect(isPluginClass(Object.freeze({ ...plugin }))).toBe(false);
    expect(() => createPluginClass("invalid", undefined as never)).toThrow(
      PluginDefinitionError,
    );
  });

  it("allocates monotonic runtime-qualified installation attempt IDs", () => {
    const first = createRuntime({ id: "first" });
    const second = createRuntime({ id: "second" });

    expect(allocatePluginInstallationId(first)).toBe(
      "first::plugin-installation-instance/installation-1",
    );
    expect(allocatePluginInstallationId(first)).toBe(
      "first::plugin-installation-instance/installation-2",
    );
    expect(allocatePluginInstallationId(second)).toBe(
      "second::plugin-installation-instance/installation-1",
    );
  });

  it("awaits async contribution and returns frozen ordered staging", async () => {
    const endpoint = await createEventEndpoint(createRuntime({ id: "app" }));
    const plugin = createPluginClass("editor.core", async (builder) => {
      builder.addEvent(eventClass);
      await Promise.resolve();
      builder.addListener(listenerClass);
      builder.bindListener(listenerClass, endpoint.endpoint);
    });

    const staged = await stagePluginContributions(plugin);

    expect(staged.events).toEqual([eventClass]);
    expect(staged.listeners).toEqual([listenerClass]);
    expect(staged.bindings).toEqual([
      { listenerClass, authority: endpoint.endpoint },
    ]);
    expect(Object.isFrozen(staged)).toBe(true);
    expect(Object.isFrozen(staged.events)).toBe(true);
    expect(Object.isFrozen(staged.bindings[0])).toBe(true);
  });

  it("invalidates a retained builder after callback settlement", async () => {
    let retained: PluginContributionBuilder | undefined;
    const plugin = createPluginClass("editor.core", (builder) => {
      retained = builder;
    });
    await stagePluginContributions(plugin);

    expect(Object.isFrozen(retained)).toBe(true);
    expect(() => retained?.addEvent(eventClass)).toThrow(PluginStagingError);
  });

  it("rejects duplicate and forged staged descriptors", async () => {
    await expect(
      stagePluginContributions(
        createPluginClass("duplicate.event", (builder) => {
          builder.addEvent(eventClass);
          builder.addEvent(eventClass);
        }),
      ),
    ).rejects.toBeInstanceOf(PluginStagingError);
    await expect(
      stagePluginContributions(
        createPluginClass("duplicate.listener", (builder) => {
          builder.addListener(listenerClass);
          builder.addListener(listenerClass);
        }),
      ),
    ).rejects.toBeInstanceOf(PluginStagingError);
    await expect(
      stagePluginContributions(
        createPluginClass("forged.event", (builder) => {
          builder.addEvent(Object.freeze({ ...eventClass }));
        }),
      ),
    ).rejects.toBeInstanceOf(PluginStagingError);
  });

  it("rejects duplicate bindings and enforces staging bounds", async () => {
    const endpoint = await createEventEndpoint(createRuntime({ id: "app" }));
    await expect(
      stagePluginContributions(
        createPluginClass("duplicate.binding", (builder) => {
          builder.bindListener(listenerClass, endpoint.endpoint);
          builder.bindListener(listenerClass, endpoint.endpoint);
        }),
      ),
    ).rejects.toBeInstanceOf(PluginStagingError);

    const manyEvents = Array.from(
      { length: PluginStagingLimits.events + 1 },
      (_, index) =>
        createEventClass(`bulk.item-${index}`, {
          value: eventField((value) => typeof value === "number"),
        }),
    );
    await expect(
      stagePluginContributions(
        createPluginClass("bounded.events", (builder) => {
          for (const definition of manyEvents) builder.addEvent(definition);
        }),
      ),
    ).rejects.toBeInstanceOf(PluginStagingError);
  });

  it("does not mutate live registries while staging", async () => {
    const events = createEventRuntime(createRuntime({ id: "app" }));
    const plugin = createPluginClass("editor.core", async (builder) => {
      builder.addEvent(eventClass);
      builder.addListener(listenerClass);
      await Promise.resolve();
      expect(events.resolve(eventClass.id)).toBeUndefined();
      expect(events.resolveListener(listenerClass.id)).toBeUndefined();
    });

    await stagePluginContributions(plugin);
    expect(events.resolve(eventClass.id)).toBeUndefined();
    expect(events.resolveListener(listenerClass.id)).toBeUndefined();
  });
});
