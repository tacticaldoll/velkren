## Context

Velkren already has a single shared authority primitive: the runtime ownership token in `runtime.ts` (`markRuntimeOwned` / `owns` / `assertOwns`), backed by a per-runtime frozen token in a `WeakMap`. Every managed domain built on top of it re-implements a **provenance + ownership** sub-pattern by hand: `event-endpoint.ts`, `listener-runtime.ts`, and `plugin-runtime.ts` each keep their own provenance `WeakMap` and repeat `assertOwns(...)` + provenance lookup + `assertActive(...)`.

Only one domain today, `event-endpoint.ts`, also exposes the full caller-facing **public/private split** this change generalizes:

- `endpointStates` / `privateEndpoints` `WeakMap`s carry "framework provenance".
- `assertEventEndpoint` performs `runtime.assertOwns(...)` (ownership first) then a provenance lookup then `assertActive(...)`.
- `EventEndpoint` (public, use-only) and `PrivateEventEndpoint` (private, can `release()`) are the split.
- The provenance-failure error literally reads `"Event endpoint capability lacks framework provenance."`

`listener-runtime.ts` and `plugin-runtime.ts` share the provenance+ownership sub-pattern but keep the managed resource internal and expose only a use-only public object, so they are not yet public/private consumers. The pattern is exactly `PROJECT.md`'s **Reference** ("owner-validated capability … possession does not expose private runtime capabilities"). There is one true public/private witness (event-endpoint), not five; `add-component-runtime` would be the second — and the first genuinely new one — which is why it, not a refactor, is the real generality test.

## Goals / Non-Goals

**Goals:**

- Provide one primitive that issues owner-validated, provenance-branded capabilities with a standard public/private split, built on the existing ownership token and managed lifecycle.
- Make the primitive general enough that a genuinely new domain (the component runtime) can consume it without hand-rolling `WeakMap`s or assertions.
- Preserve the invariants already enforced ad hoc: framework provenance, cross-runtime isolation, deterministic release, use-after-release rejection.

**Non-Goals:**

- **Scope.** The authority boundary that gates _which_ references are visible lands with `add-component-runtime`, where an instance tree gives it real acceptance. This change ships no Scope.
- **Migrating existing domains.** `event-endpoint`, listener, and plugin code stay untouched here. They migrate under separate `refactor-*-onto-references` changes, sequenced _after_ the component runtime proves the primitive generalizes.
- No renderer/DOM types, no reactive primitives in the contract (`PROJECT.md` invariant).

## Decisions

**D1 — Layer on the ownership token, do not replace it.** The primitive composes `markRuntimeOwned` + `assertOwns` plus its own provenance `WeakMap`, mirroring how `event-endpoint` already works. Alternative: fold provenance into the runtime token itself. Rejected — it would widen the smallest, most-audited primitive (`runtime.ts`) and couple every capability type to it. Keeping provenance in the new module preserves the small ownership core.

**D2 — Public/private as two distinct frozen handles sharing one managed resource.** Issuing returns `{ reference, handle }` (public + private), both `markRuntimeOwned`, both backed by one `createManagedResource`. The public reference carries no method or field reaching the private side; the private handle holds `release` and any future control ops. This is the `EventEndpoint` / `PrivateEventEndpoint` shape generalized. Alternative: a single object with a capability flag. Rejected — a flag is inspectable/forgeable and leaks the private surface, violating "possession does not expose private capability."

**D3 — Release flows through the existing managed lifecycle.** Capabilities are `createManagedResource` instances, so idempotent release, tombstones, `assertActive`, and non-swallowed cleanup failures come from `managed-lifecycle.ts` unchanged rather than being re-implemented. Alternative: a bespoke release path. Rejected — it would fork lifecycle semantics the project already guarantees.

**D4 — `event-endpoint` is a design witness, not a migration target.** Its existing semantics are used _at design time_ to check the primitive's shape is sufficient — this is reasoning captured here in the design, not a runtime test. Its code and spec are not modified in this change, and the primitive's own tests do not import it. This keeps the change minimal and scoped (`PROJECT.md`) and defers refactor risk until the component runtime has independently validated the primitive. Design-witness check performed: event-endpoint's `EventEndpoint` / `PrivateEventEndpoint` split, its ownership-then-provenance ordering, and its `release()` on the private side all map onto the primitive's public/private handles, resolution order, and private-handle release — no shape gap found.

## Risks / Trade-offs

- **Designing a general primitive against only one real consumer (event-endpoint) risks over- or under-fitting.** → Treat event-endpoint as a second consumer during design and keep the public surface minimal; the true generality test is `add-component-runtime`. If it forces a contract change, only this primitive plus the component change move — no already-migrated domain has to be reworked, because migrations are deliberately sequenced later.
- **Temporary duplication: the hand-rolled pattern still lives in event/listener/plugin after this ships.** → Accepted deliberately. The `refactor-*-onto-references` backlog items retire it one domain at a time, each behavior-preserving and independently verifiable.
- **Provenance via `WeakMap` depends on handle identity.** → Same trust model the codebase already relies on for ownership; no new exposure. Handles are frozen and non-enumerable-branded like existing runtime-owned objects.

## Migration Plan

Additive only — new module and new exports from `packages/core/src/index.ts`; no existing file changes. Rollback is deletion of the new files and exports. Downstream adoption (`add-component-runtime`, then the three refactors) happens in later changes and is out of scope here.

## Open Questions

- Exact public API surface (naming of the issue function and the two handle types) — to be pinned in `tasks.md` / implementation, kept minimal per `PROJECT.md` priority 3. The spec keeps the issue phrasing mechanism-neutral ("through the owning runtime"); the existing idiom is a free function taking a `Runtime` (e.g. `createEventEndpoint(runtime, …)`), and this change follows it.
- **Resolved:** the capability exposes a readable diagnostic identity and retains a tombstone now, not deferred. `createManagedResource` already requires a `ManagedInstanceId` + `CanonicalClassId` and always produces a `ManagedTombstone`, so the diagnostic identity is free given D3, and `PROJECT.md`'s "readable IDs support diagnostics; opaque ownership identities authorize operations" invariant requires it. This is now a spec requirement ("Readable diagnostic identity").
