## Context

Velkren composes runtime-owned domains onto a shared kernel: opaque ownership, typed registration, a central managed-instance factory, and an idempotent managed lifecycle. The component domain added `Reference` — a frozen owner-validated handle to a managed instance's public contract — and `Scope` — an extend-only, fallback-free visibility boundary. References are static: possession lets you interact through the target's public contract, and they are revoked only when the target is released.

The constitution names references, scopes, and **capabilities** as the explicit coordination mechanisms that replace selectors and global lookup. Capability _authority_ — the ability to grant a subset of authority to another holder, delegate it within a scope, and revoke it independently — was deliberately deferred out of the component change so it would not become a premature abstraction wired into reference introduction. This change adds that dynamic layer as its own domain over the existing static references, keeping the core Node.js-compatible with no DOM, renderer, or reactive dependency.

## Goals / Non-Goals

**Goals:**

- A `CapabilityRuntime` domain, one per runtime, created with an explicit `AuthorityPolicy`, mirroring the event/component/template facades.
- `Capability` as a frozen owner-validated token minted from an owner-held `Reference`, conferring an immutable declared operation set over the reference's target.
- Explicit grant and scoped delegation that are **attenuation-only**: a derived capability's operations are always a subset of its parent's; authority never widens.
- Standalone revocation that is transitive over the delegation chain and idempotent, leaving no live holder able to operate the target, and lifecycle-coupled revocation when the target is released.
- Policy enforcement (operation universe, delegation permission, maximum depth, attenuation) evaluated before any capability exists.
- Attenuation-only invocation validating provenance, ownership, a non-revoked chain, and operation membership before operating the target's public contract.
- A deterministically ordered, append-only, immutable audit trail.

**Non-Goals:**

- Renderers, DOM, reactive primitives, or browser integration.
- Cross-runtime capability sharing or a global authority registry.
- Time-based expiry, quotas, or rate limiting (only structural attenuation, depth, and revocation).
- Changing the component domain's reference or scope contracts.

## Decisions

### Compose a capability domain onto the runtime

Add one `CapabilityRuntime` per Runtime via `createCapabilityRuntime(runtime, policy?)`, mirroring `createComponentRuntime`. A second capability domain for the same runtime fails explicitly (`DuplicateCapabilityRuntimeError`) without replacing the first. The domain owns the chain store, the audit log, and a monotonic sequence counter; none are exposed. The public facade returns only owner-validated `Capability` handles and an immutable audit transcript.

Alternative considered: fold capabilities into the component domain. Rejected because authority is not specific to components — it applies to any owner-validated reference — and a separate domain keeps the component contracts unchanged and the authority model independently testable.

### Mint capabilities from owner-held references, not from possession

`mint(reference, operations)` validates that the caller owns the reference (same-runtime, genuine component-reference provenance) and that every requested operation is in the policy's operation universe, then returns a root `Capability` carrying a frozen operation set and the target's diagnostic identity. The `Capability` token is an inert diagnostic handle — grant, delegation, revocation, and invocation are performed through the owning `CapabilityRuntime`, which revalidates the token's provenance and same-runtime ownership on every call. Possession of a token never exposes the private controller, the underlying reference target object, or the chain store — only the target's public contract, and only through the domain's `invoke`.

Alternative considered: put authority operations on the token itself (as the component `Reference` does with `deref`). Rejected because a foreign or imitation token must be rejected when it _enters a domain operation_; routing grant/delegate/revoke/invoke through the domain makes that ownership check unavoidable, matching the reference-into-scope validation the component domain already performs.

### Grant and delegate are attenuation-only over a chain

Every capability records a parent link and its operation set. `grant(parent, operations?)` produces a child whose operations must be a subset of the parent's; `delegate(parent, scope, operations?)` produces a scope-bound child under the same subset rule. Omitting `operations` copies the parent's set (no widening by default). A requested operation outside the parent's set fails with `CapabilityAttenuationError` before any child is minted. This is the concrete "no last-write-wins / no privilege escalation" enforcement: a re-grant never overwrites or broadens an existing capability; it only produces a new, equal-or-narrower one.

Delegation additionally checks policy: delegation must be permitted, and the resulting depth (parent depth + 1) must not exceed the policy maximum; grant is attenuation for the same holder and does not add a delegation hop. Delegation requires a `Scope` the caller owns as its explicit authority boundary — distinguishing a scoped delegation from a plain grant — and rejects a foreign-runtime scope; the delegate does not consult the scope, selectors, the DOM, or any global registry for lookup. Grant, delegate, and revoke on a capability whose chain is already revoked fail with `CapabilityRevokedError` before any child is minted.

Alternative considered: a flat capability set with no parent links. Rejected because transitive revocation and audit lineage both require the chain.

### Revocation is transitive, idempotent, and standalone

`revoke(capability)` marks the capability and, depth-first, all its transitive delegates as revoked in one operation, appends one revocation audit record per newly revoked node, and returns without touching the target instance. After revocation, `invoke` through the revoked capability or any descendant fails with `CapabilityRevokedError`. Revocation is idempotent: a second `revoke(capability)` on an already-revoked node is a no-op that records nothing new.

Revocation is also lifecycle-coupled: when the target instance is released, its reference is already revoked by the component domain; a capability whose target reference no longer dereferences fails with a `LifecycleError` (target released), distinct from `CapabilityRevokedError` (authority withdrawn). The two failure modes stay distinguishable so callers can tell "the thing is gone" from "your authority was taken."

Alternative considered: revoke only the named node and let orphaned delegates linger until their own target release. Rejected because it would leave a live holder able to operate the target through a delegate — the exact failure the acceptance criterion forbids.

### Invocation validates the whole chain before operating the target

`invoke(capability, operation, ...args)` validates, in order: capability provenance and same-runtime ownership; that neither the capability nor any ancestor is revoked; that `operation` is in the capability's operation set; then dereferences the underlying reference (which fails as a lifecycle error if the target is released) and invokes the named operation on the target's public value. An operation not held by the capability appends a `denied` audit record and performs nothing. Foreign-runtime or imitation capabilities are rejected with an ownership or invalid-capability error before any of this.

### Policy is evaluated before a capability exists

`AuthorityPolicy` declares the operation universe (the maximal grantable set), whether delegation is allowed, and the maximum delegation depth. The domain evaluates policy at mint, grant, and delegate time and fails before minting when violated. A default permissive policy (delegation allowed, no delegation cap, no operation-universe constraint) applies when none is given, so the common case stays terse while a strict universe is opt-in. Because grant and delegate are subset-only, an explicit universe checked at mint transitively bounds every derived capability.

### Audit is append-only and deterministically ordered

The domain keeps an append-only log; each record carries a monotonic sequence number (not wall-clock time, to stay deterministic and Node-testable), the action (`mint`/`grant`/`delegate`/`revoke`/`denied`), the capability id, the parent id, and the operation set or denied operation. `audit()` returns an immutable snapshot transcript. Ordering follows the sequence counter, so replaying the same operations yields the same transcript.

## Risks / Trade-offs

- **A revoked capability leaves a live delegate** → Revocation is transitive over the chain depth-first; every descendant is marked before `revoke()` returns.
- **Delegation widens authority** → Grant and delegate enforce subset attenuation before minting; out-of-set operations fail with an attenuation error.
- **Revocation confused with target release** → Standalone revocation raises `CapabilityRevokedError`; a released target raises `LifecycleError`; the two are distinct types.
- **Authority minted from a forged or foreign reference** → Mint validates component-reference provenance and same-runtime ownership before creating any capability.
- **Non-determinism in the audit trail** → Records use a monotonic sequence counter, never wall-clock time; transcripts are reproducible.
- **Capability retains its target after release** → Capabilities dereference through the component reference, which is revoked on release; no capability holds the target instance directly.
- **Authority API creeps toward implicit lookup** → Delegation binds a scope for audit only; capabilities never perform selector- or global-style resolution.

## Migration Plan

1. Add `Capability`, `AuthorityPolicy`, audit-record types, and capability-domain error types with no change to existing domains.
2. Add `createCapabilityRuntime` composing the domain onto Runtime, with mint validating owner-held references and policy.
3. Add grant and delegation with subset attenuation, chain links, and policy (delegation permission, maximum depth).
4. Add standalone transitive revocation and lifecycle-coupled revocation with distinct error types.
5. Add attenuation-only invocation and the append-only deterministic audit trail.
6. Expose the frozen public facade through `@velkren/core` and prove kernels/chain/audit storage stay internal; run the full existing suites to prove unchanged behavior.

Rollback removes the capability facade and its internal chain/audit stores; every prior domain remains source-compatible because capabilities only compose the existing reference and scope contracts.

## Open Questions

- Whether cross-runtime capability sharing ever becomes a goal; excluded now and gated behind a demonstrated multi-runtime consumer.
- Whether policy should grow non-structural constraints (expiry, quotas); excluded until a consumer needs more than attenuation, depth, and revocation.
