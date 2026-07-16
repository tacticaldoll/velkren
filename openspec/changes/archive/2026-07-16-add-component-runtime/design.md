## Context

Velkren exposes runtime-owned event, listener, and plugin domains composed onto a shared kernel: opaque runtime ownership, typed registration with protected replacement/removal, a central managed-instance factory, and an idempotent managed lifecycle with reverse-order cleanup. No domain yet instantiates application structure or coordinates instances by anything other than direct endpoint authority.

Components are that structure. A component instance is a managed instance that also participates in a logical parent/child tree and resolves collaborators through explicit scoped references rather than selectors or global lookup. Definitions must stay portable across runtimes; instances, trees, scopes, and references are runtime-local. The core stays Node.js compatible with no DOM, renderer, template, layout, or reactive dependency.

This change deliberately excludes the dynamic capability-authority model (grant/delegate/revoke tokens and policy). References here are static owner-validated handles that are revoked only as part of lifecycle release. Capability authority is a separate follow-up change so components do not smuggle in a premature authority API.

## Goals / Non-Goals

**Goals:**

- Immutable helper-proven ComponentClass definitions with canonical `component/<slug>` identity, reusable across runtimes.
- A ComponentFactory that reuses the internal managed-instance factory boundary so no instance bypasses registration, ownership, identity, or lifecycle.
- Logical instance trees with owner-validated single-parent attachment, cycle rejection, and deterministic reverse-attachment release cascade built on the managed-lifecycle contract.
- Explicit `Scope` authority boundaries whose resolution is lexical over a parent chain, never selector- or global-based.
- Frozen owner-validated `Reference` capabilities that expose only public contracts and are revoked on release.
- One component domain per runtime and a narrow public facade with no generic registries or factory kernels.

**Non-Goals:**

- Dynamic capability grant, delegation, standalone revocation, or authority policy (deferred to `add-capability-authority`).
- Renderers, DOM, template/render-plan resolution, layout, reactive primitives, or browser event adapters.
- Reparenting, instance migration, or moving a live subtree between runtimes.
- Cross-runtime references, scope sharing, or any global component registry.

## Decisions

### Compose a component domain onto the runtime

Add one component domain per Runtime, mirroring the event/listener/plugin facades. It owns a runtime-local ComponentClass registry (a private typed registry), a ComponentFactory, a scope allocator, and a reference minter. A second component-domain facade for the same Runtime fails explicitly without replacing registries or factory. Generic `TypedRegistry`, registration definitions, and factory kernels stay private; the facade exposes only owner-validated handles.

Alternative considered: a free-standing component container independent of Runtime. Rejected because ownership isolation, identity qualification, and lifecycle already live on Runtime, and a second owner boundary would fracture the invariants.

### Prove ComponentClass definitions with a helper

`createComponentClass(slug, create)` produces an immutable, provenance-tagged definition with canonical `component/<slug>` identity, matching the ListenerClass/PluginClass helper pattern. Registration rejects frozen structural imitations and mutable definitions before publishing a registration. The `create` behavior runs only through the factory.

### Reuse the managed-instance factory boundary

ComponentFactory delegates to the existing central factory: validate an active same-runtime registration, allocate a runtime-qualified instance ID, assign opaque ownership, initialize the managed lifecycle, then run definition `create`. If `create` throws after temporary resources exist, the factory attempts reverse-order cleanup, publishes nothing, and throws a creation error preserving cause and cleanup failures. Foreign or missing registrations fail before `create` runs.

Alternative considered: let components self-construct and register themselves. Rejected because it would bypass the single creation boundary the ownership invariant depends on.

### Model the tree as owner-validated links with a reverse-attachment cascade

Each instance holds an internal parent link and an ordered child list. `attach(parent, child)` validates same-runtime ownership, single-parent (child unattached), and acyclicity (child is not an ancestor of parent) before mutating either side. Tree membership is inspectable through frozen snapshots, not live collections.

Release uses the managed lifecycle: releasing an instance first releases descendants in deterministic reverse-attachment order, then detaches from its parent, revokes issued references and scoped endpoints, and cleans owned resources in reverse registration order. Descendant release failures are collected — every remaining node still gets a release attempt — and reported as one aggregate release error. Release is idempotent.

Alternative considered: forward-order cascade. Rejected because children may hold references to parents; releasing leaves-first preserves the invariant that a live node never points at a released one.

### Make scopes lexical, extend-only, and fallback-free

`Scope` is an explicit authority boundary bound to a subtree. A scope holds only explicitly provided named references/endpoints and a link to its parent scope. Resolution walks the parent chain and returns the nearest provided entry; an unresolved name fails explicitly. There is no selector query, DOM read, or global-registry fallback — this is the concrete enforcement of the "coordination is explicit" invariant. A child scope extends its parent without mutating it, so sibling subtrees never observe each other's private entries.

Alternative considered: a mutable per-runtime service registry components read from. Rejected as exactly the global implicit lookup the project forbids.

### Mint references as frozen owner-validated capabilities

A `Reference` is a frozen opaque object carrying framework provenance and the target's opaque ownership identity, following the public/private endpoint-capability pattern. Operations through a reference validate provenance and same-runtime ownership before touching the target and expose only the target's public contract, never private controllers. Strings, DOM attributes, selectors, and copied-field imitations are rejected. On target release, references are revoked and further use fails as active-only with only diagnostic identity remaining.

This is intentionally the _static_ capability: a handle you were given. Granting, delegating, or independently revoking authority is the deferred `add-capability-authority` domain; keeping it out now avoids a premature authority abstraction.

## Risks / Trade-offs

- **Cascade cleanup can itself fail** → Continue every reverse-order release, collect failures, and report one aggregate error; never claim a clean release when a descendant failed.
- **Cyclic or double attachment corrupts the tree** → Validate ownership, single-parent, and acyclicity before any tree mutation.
- **A reference can outlive its target** → Revoke references on release and enforce active-only access with lifecycle errors.
- **Scope resolution could silently fall back** → Fail unresolved names explicitly; never consult selectors, DOM, or globals.
- **Cross-runtime attach or reference** → Validate opaque ownership before mutation or use, matching the ownership-isolation invariant.
- **Scope shape creeping toward dynamic authority** → Keep scopes extend-only and references static; route any grant/delegate need to the deferred capability change rather than widening this API.

## Migration Plan

1. Add ComponentClass definitions, the component registry, scope, reference, and error types without changing existing domains.
2. Add the ComponentFactory over the existing managed-instance factory boundary, with creation-failure cleanup tests.
3. Add tree attachment and the reverse-attachment release cascade with aggregate-failure and idempotence tests.
4. Add scope resolution and reference validation with ownership-rejection and active-only tests.
5. Compose the component domain into Runtime and expose frozen delegates through `@velkren/core`.
6. Run the full existing event/listener/plugin suites to prove unchanged behavior.

Rollback removes the component facade and its internal registry/factory adapters; all prior domains remain source-compatible because components only compose their current contracts.

## Open Questions

- How scopes and references interoperate with the future capability-authority domain (delegation chains, revocation policy) — deferred until that change defines its model.
- Whether logical trees eventually need reparenting or subtree transplant; excluded now until a template or layout consumer demonstrates the need.
