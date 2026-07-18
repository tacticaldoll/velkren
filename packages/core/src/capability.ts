import type { ManagedInstanceId } from "./identity.js";
import type { RuntimeOwned } from "./runtime.js";

/** Diagnostic-only identity of a capability within its runtime. */
export type CapabilityId = string;

/** The authority status of a capability: active until standalone revocation. */
export type CapabilityStatus = "active" | "revoked";

/**
 * A declarative authority policy for a capability domain. Every field is
 * optional; the default policy allows delegation, imposes no depth cap, and
 * places no operation-universe constraint.
 */
export interface AuthorityPolicy {
  /** The maximal grantable operation set; unbounded when omitted. */
  readonly operations?: readonly string[];
  /** Whether delegation is permitted at all; defaults to `true`. */
  readonly allowDelegation?: boolean;
  /** The maximum delegation depth (root is depth 0); unbounded when omitted. */
  readonly maxDepth?: number;
}

/**
 * A frozen, owner-validated authority token minted over a component
 * `Reference`. A capability confers an immutable subset of operations on the
 * reference's target. The token is an inert diagnostic handle: grant,
 * delegation, revocation, and invocation are performed through the owning
 * `CapabilityRuntime`, which validates provenance and ownership on every
 * operation. Possession never exposes the private controller, the target
 * instance, the underlying reference, or the chain store.
 */
export interface Capability extends RuntimeOwned {
  readonly id: CapabilityId;
  readonly targetId: ManagedInstanceId;
  /** The operations this capability confers, as a frozen sorted snapshot. */
  readonly operations: readonly string[];
  /** The parent capability's id, or `undefined` for a root capability. */
  readonly parentId: CapabilityId | undefined;
  /** Delegation depth: 0 for a root capability, +1 per delegation hop. */
  readonly depth: number;
  readonly status: CapabilityStatus;
}

/** A recorded capability-authority event. */
export type CapabilityAuditAction =
  "mint" | "grant" | "delegate" | "revoke" | "denied";

/** One append-only, deterministically ordered capability audit record. */
export interface CapabilityAuditRecord {
  readonly sequence: number;
  readonly action: CapabilityAuditAction;
  readonly capabilityId: CapabilityId;
  readonly parentId: CapabilityId | undefined;
  readonly operations: readonly string[];
  /** The denied operation; present only on `denied` records. */
  readonly operation?: string;
}

/** An immutable snapshot of the capability audit trail, ordered by sequence. */
export type CapabilityAuditTranscript = readonly CapabilityAuditRecord[];

export class DuplicateCapabilityRuntimeError extends Error {
  constructor() {
    super("Runtime already has a capability domain.");
    this.name = "DuplicateCapabilityRuntimeError";
  }
}

export class InvalidCapabilityError extends TypeError {
  constructor(readonly reason: string) {
    super(`Invalid capability: ${reason}.`);
    this.name = "InvalidCapabilityError";
  }
}

export class CapabilityAttenuationError extends Error {
  constructor(readonly operation: string) {
    super(
      `Capability cannot widen authority: operation ${JSON.stringify(operation)} is not held by the parent capability.`,
    );
    this.name = "CapabilityAttenuationError";
  }
}

export class CapabilityPolicyError extends Error {
  constructor(readonly reason: string) {
    super(`Capability policy rejected the request: ${reason}.`);
    this.name = "CapabilityPolicyError";
  }
}

export class CapabilityRevokedError extends Error {
  constructor(readonly capabilityId: CapabilityId) {
    super(
      `Capability ${JSON.stringify(capabilityId)} is revoked and can no longer operate its target.`,
    );
    this.name = "CapabilityRevokedError";
  }
}

export class CapabilityAuthorityError extends Error {
  constructor(
    readonly capabilityId: CapabilityId,
    readonly operation: string,
  ) {
    super(
      `Capability ${JSON.stringify(capabilityId)} does not authorize operation ${JSON.stringify(operation)}.`,
    );
    this.name = "CapabilityAuthorityError";
  }
}
