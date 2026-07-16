import { describe, expect, it } from "vitest";

import {
  CapabilityAttenuationError,
  CapabilityAuthorityError,
  CapabilityPolicyError,
  CapabilityRevokedError,
  DuplicateCapabilityRuntimeError,
  InvalidCapabilityError,
  type AuthorityPolicy,
} from "../src/capability.js";
import { createCapabilityRuntime } from "../src/capability-runtime.js";
import { createComponentClass } from "../src/component-class.js";
import {
  createComponentRuntime,
  type ComponentRuntime,
} from "../src/component-runtime.js";
import { LifecycleError, OwnershipError } from "../src/runtime-errors.js";
import { createRuntime } from "../src/runtime.js";

function setup(id: string, policy?: AuthorityPolicy) {
  const runtime = createRuntime({ id });
  const components = createComponentRuntime(runtime);
  const capabilities = createCapabilityRuntime(runtime, policy);
  return { runtime, components, capabilities };
}

interface DocTarget {
  read(): number;
  write(next: number): number;
  close(): void;
  readonly log: readonly string[];
}

async function makeTarget(components: ComponentRuntime, slug = "editor.doc") {
  const doc = createComponentClass(slug, (): DocTarget => {
    const log: string[] = [];
    let value = 0;
    return {
      read: () => value,
      write: (next: number) => {
        value = next;
        log.push(`write:${next}`);
        return next;
      },
      close: () => log.push("close"),
      get log() {
        return log;
      },
    };
  });
  const registration = components.register(doc);
  const instance = await components.create<DocTarget>(registration);
  const reference = components.reference(instance);
  return { instance, reference };
}

describe("capability domain", () => {
  it("composes one capability domain per runtime and rejects a second", () => {
    const { runtime, capabilities } = setup("app");
    expect(capabilities.runtime).toBe(runtime);
    expect(() => createCapabilityRuntime(runtime)).toThrow(
      DuplicateCapabilityRuntimeError,
    );
  });

  it("defaults to a permissive policy and freezes an explicit one", () => {
    const { capabilities: permissive } = setup("a");
    expect(permissive.policy.allowDelegation).toBe(true);
    expect(permissive.policy.maxDepth).toBeUndefined();
    expect(permissive.policy.operations).toBeUndefined();

    const strict = setup("b", {
      operations: ["read"],
      allowDelegation: false,
      maxDepth: 2,
    }).capabilities;
    expect(strict.policy.operations).toEqual(["read"]);
    expect(strict.policy.allowDelegation).toBe(false);
    expect(strict.policy.maxDepth).toBe(2);
    expect(Object.isFrozen(strict.policy)).toBe(true);
  });
});

describe("minting and grant attenuation", () => {
  it("mints a root capability from an owned reference", async () => {
    const { components, capabilities } = setup("app");
    const { instance, reference } = await makeTarget(components);

    const capability = capabilities.mint(reference, ["read", "write"]);

    expect(capability.operations).toEqual(["read", "write"]);
    expect(capability.targetId).toBe(instance.id);
    expect(capability.parentId).toBeUndefined();
    expect(capability.depth).toBe(0);
    expect(capability.status).toBe("active");
  });

  it("rejects a structural imitation and a foreign reference at mint", async () => {
    const { capabilities } = setup("app");
    const foreign = setup("other");
    const { reference: foreignReference } = await makeTarget(
      foreign.components,
    );

    expect(() =>
      capabilities.mint({ targetId: "x", deref: () => ({}) } as never, [
        "read",
      ]),
    ).toThrow(InvalidCapabilityError);
    expect(() => capabilities.mint(foreignReference, ["read"])).toThrow(
      OwnershipError,
    );
  });

  it("rejects operations outside an explicit policy universe", async () => {
    const { components, capabilities } = setup("app", {
      operations: ["read"],
    });
    const { reference } = await makeTarget(components);

    expect(() => capabilities.mint(reference, ["read", "write"])).toThrow(
      CapabilityPolicyError,
    );
    expect(capabilities.mint(reference, ["read"]).operations).toEqual(["read"]);
  });

  it("grants an attenuated subset and rejects widening", async () => {
    const { components, capabilities } = setup("app");
    const { reference } = await makeTarget(components);
    const root = capabilities.mint(reference, ["read", "write"]);

    const child = capabilities.grant(root, ["read"]);
    expect(child.operations).toEqual(["read"]);
    expect(child.parentId).toBe(root.id);
    expect(root.operations).toEqual(["read", "write"]);

    expect(() => capabilities.grant(child, ["write"])).toThrow(
      CapabilityAttenuationError,
    );
  });

  it("copies parent operations when none are requested and never overwrites", async () => {
    const { components, capabilities } = setup("app");
    const { reference } = await makeTarget(components);
    const root = capabilities.mint(reference, ["read", "write"]);

    const inherited = capabilities.grant(root);
    expect(inherited.operations).toEqual(["read", "write"]);

    const first = capabilities.grant(root, ["read"]);
    const second = capabilities.grant(root, ["write"]);
    expect(first.id).not.toBe(second.id);
    expect(first.operations).toEqual(["read"]);
    expect(second.operations).toEqual(["write"]);
    expect(root.operations).toEqual(["read", "write"]);
  });
});

describe("scoped delegation", () => {
  it("delegates a scope-bound child under the subset rule", async () => {
    const { components, capabilities } = setup("app");
    const { reference } = await makeTarget(components);
    const root = capabilities.mint(reference, ["read", "write"]);
    const scope = components.createScope();

    const delegate = capabilities.delegate(root, scope, ["read"]);
    expect(delegate.operations).toEqual(["read"]);
    expect(delegate.parentId).toBe(root.id);
    expect(delegate.depth).toBe(1);

    expect(() => capabilities.delegate(root, scope, ["admin"])).toThrow(
      CapabilityAttenuationError,
    );
  });

  it("enforces delegation permission and maximum depth", async () => {
    const forbid = setup("forbid", { allowDelegation: false });
    const forbidTarget = await makeTarget(forbid.components);
    const forbidRoot = forbid.capabilities.mint(forbidTarget.reference, [
      "read",
    ]);
    expect(() =>
      forbid.capabilities.delegate(forbidRoot, forbid.components.createScope()),
    ).toThrow(CapabilityPolicyError);

    const capped = setup("capped", { maxDepth: 1 });
    const cappedTarget = await makeTarget(capped.components);
    const root = capped.capabilities.mint(cappedTarget.reference, ["read"]);
    const scope = capped.components.createScope();
    const first = capped.capabilities.delegate(root, scope, ["read"]);
    expect(first.depth).toBe(1);
    expect(() => capped.capabilities.delegate(first, scope, ["read"])).toThrow(
      CapabilityPolicyError,
    );
  });

  it("rejects a foreign scope and performs no scope-based lookup", async () => {
    const { components, capabilities } = setup("app");
    const { reference } = await makeTarget(components);
    const root = capabilities.mint(reference, ["read"]);
    const foreignScope = setup("other").components.createScope();
    expect(() => capabilities.delegate(root, foreignScope, ["read"])).toThrow(
      OwnershipError,
    );

    // An empty scope does not change what the delegate operates.
    const delegate = capabilities.delegate(root, components.createScope(), [
      "read",
    ]);
    expect(delegate.targetId).toBe(root.targetId);
    expect(capabilities.invoke(delegate, "read")).toBe(0);
  });
});

describe("revocation", () => {
  it("revokes transitively so no delegate can operate the target", async () => {
    const { components, capabilities } = setup("app");
    const { instance, reference } = await makeTarget(components);
    const root = capabilities.mint(reference, ["read", "write"]);
    const delegate = capabilities.delegate(root, components.createScope(), [
      "read",
    ]);

    capabilities.revoke(root);

    expect(root.status).toBe("revoked");
    expect(delegate.status).toBe("revoked");
    expect(() => capabilities.invoke(root, "read")).toThrow(
      CapabilityRevokedError,
    );
    expect(() => capabilities.invoke(delegate, "read")).toThrow(
      CapabilityRevokedError,
    );
    // The target instance itself stays active after a standalone revoke.
    expect(instance.status).toBe("active");
  });

  it("is idempotent and records nothing on repeated revoke", async () => {
    const { components, capabilities } = setup("app");
    const { reference } = await makeTarget(components);
    const root = capabilities.mint(reference, ["read"]);

    capabilities.revoke(root);
    const afterFirst = capabilities.audit().length;
    capabilities.revoke(root);
    expect(capabilities.audit().length).toBe(afterFirst);
    expect(root.status).toBe("revoked");
  });

  it("distinguishes a released target from revoked authority", async () => {
    const { components, capabilities } = setup("app");
    const released = await makeTarget(components, "editor.a");
    const revoked = await makeTarget(components, "editor.b");
    const releasedCap = capabilities.mint(released.reference, ["read"]);
    const revokedCap = capabilities.mint(revoked.reference, ["read"]);

    await released.instance.release();
    capabilities.revoke(revokedCap);

    expect(() => capabilities.invoke(releasedCap, "read")).toThrow(
      LifecycleError,
    );
    expect(() => capabilities.invoke(revokedCap, "read")).toThrow(
      CapabilityRevokedError,
    );
    // The distinction is deliberate: a released target leaves authority intact
    // (the target is simply gone); only standalone revocation withdraws it.
    expect(releasedCap.status).toBe("active");
    expect(revokedCap.status).toBe("revoked");
  });

  it("refuses to grant or delegate from a revoked capability", async () => {
    const { components, capabilities } = setup("app");
    const { reference } = await makeTarget(components);
    const root = capabilities.mint(reference, ["read"]);
    capabilities.revoke(root);

    expect(() => capabilities.grant(root, ["read"])).toThrow(
      CapabilityRevokedError,
    );
    expect(() =>
      capabilities.delegate(root, components.createScope(), ["read"]),
    ).toThrow(CapabilityRevokedError);
  });
});

describe("invocation, policy, and audit", () => {
  it("operates the target through an authorized operation", async () => {
    const { components, capabilities } = setup("app");
    const { instance, reference } = await makeTarget(components);
    const capability = capabilities.mint(reference, ["read", "write"]);

    expect(capabilities.invoke(capability, "write", 7)).toBe(7);
    expect(capabilities.invoke(capability, "read")).toBe(7);
    expect(instance.value.log).toEqual(["write:7"]);
  });

  it("denies an unauthorized operation without operating the target", async () => {
    const { components, capabilities } = setup("app");
    const { instance, reference } = await makeTarget(components);
    const capability = capabilities.mint(reference, ["read"]);

    expect(() => capabilities.invoke(capability, "write", 1)).toThrow(
      CapabilityAuthorityError,
    );
    expect(instance.value.log).toEqual([]);
    const denied = capabilities.audit().find((r) => r.action === "denied");
    expect(denied?.operation).toBe("write");
    expect(denied?.capabilityId).toBe(capability.id);
  });

  it("rejects a foreign or imitation capability at invocation", async () => {
    const { capabilities } = setup("app");
    const other = setup("other");
    const foreignTarget = await makeTarget(other.components);
    const foreignCap = other.capabilities.mint(foreignTarget.reference, [
      "read",
    ]);

    expect(() => capabilities.invoke(foreignCap, "read")).toThrow(
      OwnershipError,
    );
    expect(() => capabilities.invoke({ id: "fake" } as never, "read")).toThrow(
      InvalidCapabilityError,
    );
  });

  it("records a deterministically ordered, immutable audit trail", async () => {
    const { components, capabilities } = setup("app");
    const { reference } = await makeTarget(components);
    const root = capabilities.mint(reference, ["read", "write"]);
    const child = capabilities.grant(root, ["read"]);
    capabilities.delegate(child, components.createScope(), ["read"]);
    capabilities.revoke(root);

    const transcript = capabilities.audit();
    expect(transcript.map((r) => r.action)).toEqual([
      "mint",
      "grant",
      "delegate",
      "revoke",
      "revoke",
      "revoke",
    ]);
    expect(transcript.map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Object.isFrozen(transcript)).toBe(true);

    // The snapshot is stable: later operations do not mutate it.
    const before = transcript.length;
    capabilities.mint(reference, ["read"]);
    expect(transcript.length).toBe(before);
    expect(capabilities.audit().length).toBe(before + 1);
  });
});
