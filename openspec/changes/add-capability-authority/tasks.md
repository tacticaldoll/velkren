## 1. Capability Domain and Types

- [ ] 1.1 Add capability-domain error types (`DuplicateCapabilityRuntimeError`, `CapabilityAuthorityError`, `CapabilityAttenuationError`, `CapabilityRevokedError`, `CapabilityPolicyError`, `InvalidCapabilityError`) and internal provenance tagging for capability tokens.
- [ ] 1.2 Add `Capability`, `AuthorityPolicy`, and capability audit-record/transcript types with immutable, diagnostic-only public shapes.
- [ ] 1.3 Implement `createCapabilityRuntime(runtime, policy?)` composing one capability domain per Runtime, with duplicate-domain rejection and a default permissive policy.
- [ ] 1.4 Add tests for one-domain-per-runtime, duplicate rejection, default vs explicit policy, and no generic authority kernel exposure.

## 2. Minting and Grant Attenuation

- [ ] 2.1 Implement `mint(reference, operations)` validating owner-held component-reference provenance, same-runtime ownership, and operation-universe membership before minting a frozen root capability with an immutable operation set and diagnostic target identity.
- [ ] 2.2 Implement `grant(operations?)` producing an attenuation-only child (subset of parent operations; parent set copied when omitted), rejecting out-of-set operations with `CapabilityAttenuationError` before minting, and never widening or overwriting an existing capability.
- [ ] 2.3 Add tests for mint from an owned reference, rejection of forged/foreign references, out-of-universe rejection, subset grant, out-of-set grant rejection, and no-widening on re-grant.

## 3. Scoped Delegation and Chain

- [ ] 3.1 Implement `delegate(scope, operations?)` producing a scope-bound derived capability under the subset rule, recording a parent link and depth in the delegation chain.
- [ ] 3.2 Enforce policy at delegation: delegation-permitted and maximum-depth checks fail with `CapabilityPolicyError` before minting; delegation binds the scope for audit only and performs no selector or global lookup.
- [ ] 3.3 Add tests for scoped delegation, subset attenuation on delegates, delegation-forbidden and max-depth policy rejection, and chain lineage inspection.

## 4. Revocation

- [ ] 4.1 Implement standalone `revoke()` marking the capability and all transitive delegates revoked depth-first in one idempotent operation without releasing the target, so no holder in the chain can operate the target afterward.
- [ ] 4.2 Implement lifecycle-coupled revocation: a capability whose target reference is released fails with `LifecycleError`, distinct from `CapabilityRevokedError`.
- [ ] 4.3 Add tests for transitive revocation leaving no live delegate holder, idempotent repeated revoke, standalone revoke not releasing the target, and released-target vs revoked distinction.

## 5. Invocation, Policy, and Audit

- [ ] 5.1 Implement `invoke(operation, ...args)` validating provenance, same-runtime ownership, non-revoked chain, and operation membership before operating the target's public contract; deny unauthorized/foreign/imitation/revoked/released chains explicitly without performing the operation.
- [ ] 5.2 Implement the append-only, monotonically ordered audit trail (`mint`/`grant`/`delegate`/`revoke`/`denied`) exposed as an immutable transcript with capability and parent identity, using a sequence counter rather than wall-clock time.
- [ ] 5.3 Add tests for authorized invocation operating the target, unauthorized-operation denial with an audit record, revoked/released invocation failure, and deterministic audit ordering.

## 6. Public Facade and Verification

- [ ] 6.1 Add intentional public exports for capability-authority creation, `Capability`, `AuthorityPolicy`, audit transcript types, and capability errors while proving chain internals, audit storage, and any authority kernel remain unavailable.
- [ ] 6.2 Prove component reference/scope contracts and all prior domains are unchanged by adding the capability domain (run existing suites).
- [ ] 6.3 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, and `openspec validate --all`; resolve every failure.
- [ ] 6.4 Perform adversarial review against project invariants, delta and living specs, forged/foreign capability and reference rejection, attenuation (no widening), transitive and idempotent revocation leaving no live holder, released-vs-revoked distinction, policy (universe/delegation/depth) enforcement, deterministic audit, public export boundary, Node.js isolation, and the deferred cross-runtime boundary before sync and archive.
