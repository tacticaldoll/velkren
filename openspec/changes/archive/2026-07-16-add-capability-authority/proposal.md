## Why

The component runtime introduced `Reference` as a _static_ owner-validated capability: a handle you were given, revoked only when its target is released. That deliberately excluded the dynamic authority the constitution names as first-class coordination — granting a subset of authority to another holder, delegating it within a scope, and revoking it on its own without tearing down the target. Every downstream domain that shares authority (plugins handing components to each other, adapters holding operable handles, future cross-subtree coordination) needs that dynamic layer, and it must be built explicitly over references rather than smuggled into their introduction, so that grant/delegate/revoke are auditable and attenuation-only from the start.

## What Changes

- Add a `CapabilityRuntime` domain, one per runtime, composed onto `Runtime` beside the component domain, created with an explicit `AuthorityPolicy`.
- Add `Capability` as a frozen owner-validated authority token minted from an owner-held `Reference`, conferring a declared, immutable set of operations over the reference's target.
- Add **explicit grant** producing a child capability whose operations are a subset of its parent's — attenuation-only, never widening; no last-write-wins re-grant.
- Add **scoped delegation** producing a scope-bound derived capability of equal-or-narrower authority, recorded in a delegation chain with a parent link, gated by policy (delegation permitted, maximum depth).
- Add **standalone revocation** that invalidates a capability and all its transitive delegates immediately and idempotently, without releasing the target, leaving no live holder able to operate it; plus lifecycle-coupled revocation when the target is released, with a distinct lifecycle error.
- Add **authority policy enforcement** (operation universe, delegation permission, maximum depth, attenuation) evaluated before any capability is minted.
- Add **capability invocation** that validates provenance, same-runtime ownership, a non-revoked chain, and operation membership before operating the target's public contract.
- Add an **append-only, deterministically ordered audit trail** of grant, delegation, revocation, and denied-invocation events, exposed as an immutable transcript.
- Keep renderers, DOM, reactive primitives, and cross-runtime capability sharing **out of scope**.

## Capabilities

### New Capabilities

- `capability-authority`: dynamic capability authority over owner-validated references — policy-governed grant, scoped delegation, standalone and lifecycle-coupled revocation, attenuation-only invocation, and an immutable audit trail, all framework-independent.

### Modified Capabilities

None. Capabilities compose over the existing component `Reference` and `Scope` contracts without changing their externally observable requirements. The component domain's references stay static; dynamic authority lives entirely in the new domain.

## Impact

- Extends the public `@velkren/core` API with capability-authority creation, `Capability` handles, `AuthorityPolicy`, the audit transcript types, and capability-domain error contracts.
- Reuses the ownership, managed-lifecycle, and component-reference contracts; adds no generic authority kernel to the public export map.
- Adds no renderer primitive, DOM type, reactive dependency, or cross-runtime sharing.
- Advances the backlog: `add-capability-authority` moves from `ready` to `done`, completing the deferred authority outcome split out of `add-component-runtime`.
