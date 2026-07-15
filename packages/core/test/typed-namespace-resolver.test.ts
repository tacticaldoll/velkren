import { describe, expect, it } from "vitest";

import {
  createDefinitionKind,
  type ClassDefinition,
} from "../src/definition.js";
import { createCanonicalClassId } from "../src/identity.js";
import {
  InvalidLoaderContributionError,
  LoaderExecutionError,
  LoaderKindError,
  NoMatchingLoaderError,
} from "../src/loader-errors.js";
import { DuplicateRegistrationError } from "../src/registration-errors.js";
import { createRuntime } from "../src/runtime.js";
import {
  TypedLoaderRegistry,
  createLoaderKind,
} from "../src/typed-loader-registry.js";
import {
  MAX_LOADER_CONTRIBUTIONS,
  TypedNamespaceResolver,
} from "../src/typed-namespace-resolver.js";
import { TypedRegistry } from "../src/typed-registry.js";

const alpha = createDefinitionKind<string>("alpha");
const beta = createDefinitionKind<string>("beta");
const alphaLoaders = createLoaderKind<string>("alpha");
const betaLoaders = createLoaderKind<string>("beta");

function createHarness() {
  const runtime = createRuntime({ id: "test" });
  const registry = new TypedRegistry<string>(runtime, alpha.kind);
  const loaders = new TypedLoaderRegistry<string>(runtime, alpha.kind);
  const resolver = new TypedNamespaceResolver(registry, loaders);
  return { loaders, registry, resolver, runtime };
}

describe("typed namespace resolver", () => {
  it("keeps sync lookup pure and bypasses loaders for active classes", async () => {
    const { loaders, registry, resolver } = createHarness();
    let calls = 0;
    loaders.register(
      alphaLoaders.define(undefined, () => {
        calls += 1;
        return [];
      }),
    );
    const definition = alpha.define("app.item", () => "item");

    expect(registry.resolve(definition.id)).toBeUndefined();
    expect(calls).toBe(0);
    const active = registry.register(definition);
    await expect(resolver.load(definition.id)).resolves.toBe(active);
    expect(calls).toBe(0);
  });

  it("deduplicates one class by promise identity and keeps classes independent", async () => {
    const { loaders, resolver } = createHarness();
    const pending = new Map<
      string,
      (definitions: ClassDefinition<string>[]) => void
    >();
    let calls = 0;
    loaders.register(
      alphaLoaders.define("app", (classId) => {
        calls += 1;
        return new Promise((resolve) => pending.set(classId, resolve));
      }),
    );
    const firstDefinition = alpha.define("app.first", () => "first");
    const secondDefinition = alpha.define("app.second", () => "second");

    const first = resolver.load(firstDefinition.id);
    const duplicate = resolver.load(firstDefinition.id);
    const second = resolver.load(secondDefinition.id);
    expect(duplicate).toBe(first);
    expect(second).not.toBe(first);
    expect(calls).toBe(2);

    pending.get(firstDefinition.id)?.([firstDefinition]);
    pending.get(secondDefinition.id)?.([secondDefinition]);
    await expect(first).resolves.toMatchObject({ classId: firstDefinition.id });
    await expect(second).resolves.toMatchObject({
      classId: secondDefinition.id,
    });
  });

  it("retries after failure and never falls back from the deepest loader", async () => {
    const { loaders, resolver } = createHarness();
    let rootCalls = 0;
    let deepCalls = 0;
    const definition = alpha.define("app.editor.item", () => "item");
    loaders.register(
      alphaLoaders.define(undefined, () => {
        rootCalls += 1;
        return [definition];
      }),
    );
    loaders.register(
      alphaLoaders.define("app.editor", () => {
        deepCalls += 1;
        if (deepCalls === 1) {
          throw new Error("temporary failure");
        }
        return [definition];
      }),
    );

    await expect(resolver.load(definition.id)).rejects.toBeInstanceOf(
      LoaderExecutionError,
    );
    await expect(resolver.load(definition.id)).resolves.toMatchObject({
      classId: definition.id,
    });
    expect(deepCalls).toBe(2);
    expect(rootCalls).toBe(0);
  });

  it("publishes a valid multi-definition contribution atomically", async () => {
    const { loaders, registry, resolver } = createHarness();
    const requested = alpha.define("app.requested", () => "requested");
    const related = alpha.define("app.related", () => "related");
    loaders.register(alphaLoaders.define("app", () => [requested, related]));

    const loaded = await resolver.load(requested.id);
    expect(loaded).toBe(registry.resolve(requested.id));
    expect(registry.resolve(related.id)?.revision).toBe(2);
  });

  it.each([
    ["missing target", () => [alpha.define("app.other", () => "other")]],
    ["wrong kind", () => [beta.define("app.item", () => "beta")]],
    ["outside namespace", () => [alpha.define("other.item", () => "other")]],
    [
      "duplicate",
      () => [
        alpha.define("app.item", () => "first"),
        alpha.define("app.item", () => "second"),
      ],
    ],
    [
      "mutable",
      () => [
        {
          ...alpha.define("app.item", () => "item"),
        },
      ],
    ],
  ] satisfies Array<[string, () => ClassDefinition<string>[]]>)(
    "rejects %s contribution without publication",
    async (_label, contribution) => {
      const { loaders, registry, resolver } = createHarness();
      const requested = createCanonicalClassId("alpha", "app.item");
      loaders.register(alphaLoaders.define("app", contribution));

      await expect(resolver.load(requested)).rejects.toBeInstanceOf(
        InvalidLoaderContributionError,
      );
      expect(registry.resolve(requested)).toBeUndefined();
      for (const definition of contribution()) {
        expect(registry.resolve(definition.id)).toBeUndefined();
      }
    },
  );

  it("rejects conflicts and bounded overflow without partial publication", async () => {
    const { loaders, registry, resolver } = createHarness();
    const requested = alpha.define("app.item", () => "item");
    const active = alpha.define("app.active", () => "active");
    registry.register(active);
    loaders.register(alphaLoaders.define("app", () => [requested, active]));

    await expect(resolver.load(requested.id)).rejects.toBeInstanceOf(
      DuplicateRegistrationError,
    );
    expect(registry.resolve(requested.id)).toBeUndefined();
    expect(registry.resolve(active.id)?.definition).toBe(active);

    const overflowHarness = createHarness();
    const many = Array.from(
      { length: MAX_LOADER_CONTRIBUTIONS + 1 },
      (_, index) => alpha.define(`app.item-${index}`, () => String(index)),
    );
    overflowHarness.loaders.register(alphaLoaders.define("app", () => many));
    await expect(
      overflowHarness.resolver.load(many[0].id),
    ).rejects.toBeInstanceOf(InvalidLoaderContributionError);
    expect(overflowHarness.registry.resolve(many[0].id)).toBeUndefined();
  });

  it("rejects absent loaders, kind mismatch, and mismatched registry context", async () => {
    const { registry, resolver, runtime } = createHarness();
    const missing = alpha.define("app.missing", () => "missing");
    await expect(resolver.load(missing.id)).rejects.toBeInstanceOf(
      NoMatchingLoaderError,
    );
    await expect(
      resolver.load(createCanonicalClassId("beta", "app.item")),
    ).rejects.toBeInstanceOf(LoaderKindError);

    const otherRuntime = createRuntime({ id: "test" });
    expect(
      () =>
        new TypedNamespaceResolver(
          registry,
          new TypedLoaderRegistry(otherRuntime, alpha.kind),
        ),
    ).toThrow(TypeError);
    expect(
      () =>
        new TypedNamespaceResolver(
          registry,
          new TypedLoaderRegistry(runtime, betaLoaders.kind),
        ),
    ).toThrow(LoaderKindError);
  });
});
