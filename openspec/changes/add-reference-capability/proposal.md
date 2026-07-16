## Why

Every managed domain since semantic events hand-rolls the same "owner-validated capability" sub-pattern — a provenance `WeakMap` plus a `runtime.assertOwns` + provenance check — in `event-endpoint`, `listener-runtime`, and `plugin-runtime`. `event-endpoint` goes further and is the one domain that also exposes the full public (use-only) / private (control-and-release) handle split; its own error even reads `"Event endpoint capability lacks framework provenance."`, which is `PROJECT.md`'s definition of a **Reference** hand-rolled inside one domain. The upcoming component runtime would have to reinvent that split a second time. Extracting the pattern into one primitive now stops the duplication from compounding and gives the component runtime a shared abstraction to consume instead of reinventing.

## What Changes

- Introduce a shared **reference/capability** primitive layered directly on the existing runtime ownership token (`markRuntimeOwned` / `assertOwns`).
- A capability is created through the owning runtime, carries framework provenance, and is validated by owner + provenance before use — strings, DOM attributes, and selectors never grant it.
- Standardize the **public/private split**: a private handle can control and release the capability; a public reference can only be used and exposes no private runtime capability, even to a holder.
- Provide the standard `assert` / `resolve` operations that today each domain writes by hand, plus deterministic release that participates in the existing managed-lifecycle cleanup.
- This change adds the primitive only. It does **not** modify `event-endpoint`, `managed-listeners`, or `plugin-transactions`; `event-endpoint` is used solely as a second design consumer to pressure-test generality. Migrating those domains onto the primitive is deferred to separate `refactor-*-onto-references` changes.
- **Scope is out of scope here** — it lands with `add-component-runtime`, where a real instance tree gives it meaningful acceptance.

## Capabilities

### New Capabilities

- `reference-capability`: owner-validated, provenance-branded capability handles with a standard public (use-only) / private (control-and-release) split, resolvable only through the owning runtime and released deterministically through the managed lifecycle.

### Modified Capabilities

<!-- None. This change adds the primitive without altering existing spec-level behavior. Existing domains migrate under separate refactor-*-onto-references changes. -->

## Impact

- **New**: `specs/reference-capability/spec.md`; new core source implementing the primitive on top of `runtime.ts` and `managed-lifecycle.ts`; new public exports from `packages/core/src/index.ts`.
- **Unchanged**: `event-endpoint.ts`, listener, and plugin code and their specs remain untouched; existing specs must still pass.
- **Consumers**: `add-component-runtime` (and later refactors of event/listener/plugin domains) depend on this primitive.
- **Non-goals**: no Scope, no renderer/DOM types, no migration of existing domains in this change.
