import {
  CapabilityAttenuationError,
  CapabilityAuthorityError,
  CapabilityPolicyError,
  CapabilityRevokedError,
  DuplicateCapabilityRuntimeError,
  InvalidCapabilityError,
  type AuthorityPolicy,
  type Capability,
  type CapabilityAuditAction,
  type CapabilityAuditRecord,
  type CapabilityAuditTranscript,
  type CapabilityId,
} from "./capability.js";
import type { Reference, Scope } from "./component-class.js";
import { isComponentReference } from "./component-runtime.js";
import { markRuntimeOwned, type Runtime } from "./runtime.js";

/** The capability-authority domain composed onto one Runtime. */
export interface CapabilityRuntime {
  readonly runtime: Runtime;
  /** The resolved, frozen authority policy in force for this domain. */
  readonly policy: AuthorityPolicy;
  /** Mint a root capability from a same-runtime reference the caller owns. */
  mint(reference: Reference, operations: Iterable<string>): Capability;
  /** Derive an attenuation-only child capability (a subset of the parent). */
  grant(parent: Capability, operations?: Iterable<string>): Capability;
  /** Derive a scope-bound child capability under the same subset rule. */
  delegate(
    parent: Capability,
    scope: Scope,
    operations?: Iterable<string>,
  ): Capability;
  /** Revoke a capability and all its transitive delegates, idempotently. */
  revoke(capability: Capability): void;
  /** Operate the target's public contract through an authorized operation. */
  invoke<Result = unknown>(
    capability: Capability,
    operation: string,
    ...args: unknown[]
  ): Result;
  /** An immutable snapshot of the audit trail, ordered by sequence. */
  audit(): CapabilityAuditTranscript;
}

interface CapabilityNode {
  readonly id: CapabilityId;
  readonly parent: CapabilityNode | undefined;
  readonly depth: number;
  readonly operations: ReadonlySet<string>;
  readonly reference: Reference;
  readonly children: CapabilityNode[];
  token: Capability | undefined;
  revoked: boolean;
}

const capabilityRuntimes = new WeakMap<Runtime, CapabilityRuntime>();
const capabilityTokens = new WeakSet<object>();

/** Narrow an unknown value to a genuine helper-minted Capability. */
export function isCapability(value: unknown): value is Capability {
  return (
    typeof value === "object" && value !== null && capabilityTokens.has(value)
  );
}

/** Create the single capability-authority domain for a Runtime. */
export function createCapabilityRuntime(
  runtime: Runtime,
  policy?: AuthorityPolicy,
): CapabilityRuntime {
  if (capabilityRuntimes.has(runtime)) {
    throw new DuplicateCapabilityRuntimeError();
  }
  const domain = new DefaultCapabilityRuntime(runtime, policy);
  capabilityRuntimes.set(runtime, domain);
  return domain;
}

class DefaultCapabilityRuntime implements CapabilityRuntime {
  readonly policy: AuthorityPolicy;
  readonly #universe: ReadonlySet<string> | undefined;
  readonly #allowDelegation: boolean;
  readonly #maxDepth: number | undefined;
  readonly #nodes = new WeakMap<Capability, CapabilityNode>();
  readonly #records: CapabilityAuditRecord[] = [];
  #sequence = 0;
  #capabilitySequence = 0;

  constructor(
    readonly runtime: Runtime,
    policy: AuthorityPolicy | undefined,
  ) {
    const operations =
      policy?.operations === undefined
        ? undefined
        : Object.freeze([...policy.operations]);
    this.#universe = operations === undefined ? undefined : new Set(operations);
    this.#allowDelegation = policy?.allowDelegation ?? true;
    this.#maxDepth = policy?.maxDepth;
    this.policy = Object.freeze({
      ...(operations === undefined ? {} : { operations }),
      allowDelegation: this.#allowDelegation,
      ...(this.#maxDepth === undefined ? {} : { maxDepth: this.#maxDepth }),
    });
  }

  mint(reference: Reference, operations: Iterable<string>): Capability {
    if (!isComponentReference(reference)) {
      throw new InvalidCapabilityError("value is not a component reference");
    }
    this.runtime.assertOwns(reference);
    const requested = new Set(operations);
    this.#assertWithinUniverse(requested);
    const node = this.#createNode(undefined, requested, reference);
    this.#record("mint", node);
    return node.token as Capability;
  }

  grant(parent: Capability, operations?: Iterable<string>): Capability {
    const parentNode = this.#nodeOf(parent);
    this.#assertActiveChain(parentNode);
    const derived = this.#attenuate(parentNode, operations);
    const node = this.#createNode(parentNode, derived, parentNode.reference);
    this.#record("grant", node);
    return node.token as Capability;
  }

  delegate(
    parent: Capability,
    scope: Scope,
    operations?: Iterable<string>,
  ): Capability {
    const parentNode = this.#nodeOf(parent);
    this.#assertActiveChain(parentNode);
    this.runtime.assertOwns(scope);
    if (!this.#allowDelegation) {
      throw new CapabilityPolicyError("delegation is not permitted");
    }
    const depth = parentNode.depth + 1;
    if (this.#maxDepth !== undefined && depth > this.#maxDepth) {
      throw new CapabilityPolicyError(
        `delegation depth ${depth} exceeds the maximum of ${this.#maxDepth}`,
      );
    }
    const derived = this.#attenuate(parentNode, operations);
    const node = this.#createNode(
      parentNode,
      derived,
      parentNode.reference,
      depth,
    );
    this.#record("delegate", node);
    return node.token as Capability;
  }

  revoke(capability: Capability): void {
    const node = this.#nodeOf(capability);
    if (node.revoked) return;
    // Mark the node then its transitive delegates depth-first, recording one
    // revocation per newly revoked node so repeated revoke stays idempotent.
    const revoke = (current: CapabilityNode): void => {
      if (current.revoked) return;
      current.revoked = true;
      this.#record("revoke", current);
      for (const child of current.children) revoke(child);
    };
    revoke(node);
  }

  invoke<Result = unknown>(
    capability: Capability,
    operation: string,
    ...args: unknown[]
  ): Result {
    const node = this.#nodeOf(capability);
    if (this.#isChainRevoked(node)) {
      throw new CapabilityRevokedError(node.id);
    }
    if (!node.operations.has(operation)) {
      this.#recordDenied(node, operation);
      throw new CapabilityAuthorityError(node.id, operation);
    }
    // deref fails with a LifecycleError when the target has been released,
    // keeping "target gone" distinct from "authority revoked".
    const target = node.reference.deref();
    const value = target.value as Record<string, unknown>;
    const behavior = value[operation];
    if (typeof behavior !== "function") {
      throw new CapabilityAuthorityError(node.id, operation);
    }
    return (behavior as (...call: unknown[]) => unknown).apply(
      value,
      args,
    ) as Result;
  }

  audit(): CapabilityAuditTranscript {
    return Object.freeze(this.#records.map((record) => record));
  }

  #attenuate(
    parent: CapabilityNode,
    operations: Iterable<string> | undefined,
  ): Set<string> {
    if (operations === undefined) {
      return new Set(parent.operations);
    }
    const requested = new Set(operations);
    for (const operation of requested) {
      if (!parent.operations.has(operation)) {
        throw new CapabilityAttenuationError(operation);
      }
    }
    return requested;
  }

  #assertWithinUniverse(operations: ReadonlySet<string>): void {
    if (this.#universe === undefined) return;
    for (const operation of operations) {
      if (!this.#universe.has(operation)) {
        throw new CapabilityPolicyError(
          `operation ${JSON.stringify(operation)} is outside the policy universe`,
        );
      }
    }
  }

  #assertActiveChain(node: CapabilityNode): void {
    if (this.#isChainRevoked(node)) {
      throw new CapabilityRevokedError(node.id);
    }
  }

  #isChainRevoked(node: CapabilityNode): boolean {
    let current: CapabilityNode | undefined = node;
    while (current !== undefined) {
      if (current.revoked) return true;
      current = current.parent;
    }
    return false;
  }

  #createNode(
    parent: CapabilityNode | undefined,
    operations: Set<string>,
    reference: Reference,
    depth = parent?.depth ?? 0,
  ): CapabilityNode {
    const node: CapabilityNode = {
      id: this.#nextCapabilityId(),
      parent,
      depth,
      operations: Object.freeze(new Set(operations)),
      reference,
      children: [],
      token: undefined,
      revoked: false,
    };
    node.token = this.#createToken(node);
    this.#nodes.set(node.token, node);
    if (parent !== undefined) parent.children.push(node);
    return node;
  }

  #createToken(node: CapabilityNode): Capability {
    // Arrow closures capture `this` lexically so status reflects live chain
    // revocation without aliasing the domain into the frozen token.
    const isRevoked = (): boolean => this.#isChainRevoked(node);
    const token = Object.freeze(
      markRuntimeOwned(this.runtime, {
        id: node.id,
        targetId: node.reference.targetId,
        parentId: node.parent?.id,
        depth: node.depth,
        get operations(): readonly string[] {
          return Object.freeze([...node.operations].sort());
        },
        get status(): "active" | "revoked" {
          return isRevoked() ? "revoked" : "active";
        },
      }),
    ) as Capability;
    capabilityTokens.add(token);
    return token;
  }

  #nodeOf(capability: Capability): CapabilityNode {
    if (!capabilityTokens.has(capability)) {
      throw new InvalidCapabilityError("value lacks capability provenance");
    }
    this.runtime.assertOwns(capability);
    const node = this.#nodes.get(capability);
    if (node === undefined) {
      throw new InvalidCapabilityError(
        "capability does not belong to this domain",
      );
    }
    return node;
  }

  #record(action: CapabilityAuditAction, node: CapabilityNode): void {
    this.#records.push(
      Object.freeze({
        sequence: (this.#sequence += 1),
        action,
        capabilityId: node.id,
        parentId: node.parent?.id,
        operations: Object.freeze([...node.operations].sort()),
      }),
    );
  }

  #recordDenied(node: CapabilityNode, operation: string): void {
    this.#records.push(
      Object.freeze({
        sequence: (this.#sequence += 1),
        action: "denied",
        capabilityId: node.id,
        parentId: node.parent?.id,
        operations: Object.freeze([...node.operations].sort()),
        operation,
      }),
    );
  }

  #nextCapabilityId(): CapabilityId {
    this.#capabilitySequence += 1;
    return `${this.runtime.id}/capability/cap-${this.#capabilitySequence}`;
  }
}
