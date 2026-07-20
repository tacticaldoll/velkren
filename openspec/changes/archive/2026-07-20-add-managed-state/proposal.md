## Why

`PROJECT.md` names **state** among the runtime's owned domains and Velkren's purpose is "a browser-side UI runtime for **stateful** application interfaces", but there is no state domain: a component instance's created `value` is read-only and cannot change, and nothing can observe a change. The reactive loop (`interaction → event → listener → state → binding → commit`) has no place to hold the state a listener mutates or that a binding reacts to. This change adds the first half of that loop: mutable, owner-validated, observable runtime state, so a later `add-state-binding` can derive a view from it and re-commit.

## What Changes

- Add a **managed-state** domain: `createStateRuntime(runtime)` returns a per-runtime `StateRuntime` whose `create(initial)` mints a managed `StateHandle`.
- A `StateHandle` holds a frozen strict-JSON value and exposes: `read()` (the current frozen value), `update(next | (previous) => next)` (an explicit write that validates and freezes the new value, stores it, and notifies observers), and `observe(observer)` (subscribe to changes; returns a removable subscription).
- State is **core-owned and explicit**: reactivity is a synchronous observer notification list — no renderer-native or reactive-library primitive appears in any contract. Updates are explicit calls (the B1 model), not hidden dependency tracking.
- A `StateHandle` is a managed, owner-validated instance: operations reject a released target, `release()` clears observers and revokes further updates and is idempotent, and the runtime owns it so a later domain can `assertOwns` it.
- State is standalone: it does not change `ComponentInstance.value` or any existing contract. An application composes state handles into its components and listeners.

## Capabilities

### New Capabilities

- `managed-state`: an owner-validated, observable, deterministically-released cell holding a frozen strict-JSON value, updated only through an explicit owned handle, with core-owned synchronous change notification and no renderer/reactive types in its contract.

### Modified Capabilities

<!-- none -->

## Impact

- **Code**: new `packages/core/src/state-runtime.ts`; new public exports from `packages/core/src/index.ts`. No existing core module changes; no adapter change.
- **Contracts**: additive only. No change to `ComponentInstance`, `RendererPort`, events, or any existing domain.
- **Dependencies**: none new; reuses `createManagedResource`/`createManagedInstanceId` (lifecycle), `createCanonicalClassId` (identity), and `createJsonSnapshot` (strict-JSON) internally.
- **Tests**: a new core (Node-only) test suite for create/read/update/observe/release, ownership rejection, non-JSON rejection, released-target rejection, observer add/remove, and observer-throw containment.
- **Deferred (not in this change)**: the `state → view` binding domain and re-commit (`add-state-binding`); delegable/attenuable write authority via `capability-authority`; a core-owned signal graph for auto-tracked derivations.
