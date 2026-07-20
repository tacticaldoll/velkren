## Context

Component instance state today is inert. `ComponentRuntime.create` calls the class's `create` behavior, holds the returned `value` behind a cleared-on-release cell, and exposes it read-only via `ComponentInstance.value`. There is no update path and no way to observe a change. Templates carry static JSON; the projection commits a node the template produced. So the only data flows are static templates and the interaction→event→out path — no state a listener can mutate, and nothing a binding can react to.

The runtime already establishes the shape a new managed primitive should follow: `createManagedResource(runtime, id, classId)` yields a managed object (`status`, `tombstone`, `assertActive`, `release`) with an ordered cleanup list; class-less managed resources mint an id with `createManagedInstanceId(runtime.id, "<kind>", "<local>")` and a canonical class id with `createCanonicalClassId("<kind>", "<local>")` (as `event-endpoint` does); strict-JSON values are normalized and deeply frozen by `createJsonSnapshot`; a domain is one-per-runtime, guarded by a `WeakMap<Runtime, Domain>`; owner-validation is `runtime.assertOwns(x)` / `markRuntimeOwned`.

`PROJECT.md` constrains this: runtime state is authoritative; no renderer-native or reactive-library primitive may appear in a framework-independent contract; every managed instance has an explicit, observable, idempotent lifecycle whose release cleans owned resources without silently swallowing failures.

## Goals / Non-Goals

**Goals:**

- Mutable, owner-validated, observable runtime state as a managed instance, holding a frozen strict-JSON value.
- Explicit update (the B1 model): a state change is an explicit `update` call, not hidden dependency tracking.
- Core-owned reactivity: change notification is a plain synchronous observer list; no signal/reactive type crosses any contract.
- Deterministic lifecycle: `release` clears observers, makes further updates fail active-only, and is idempotent; failures are not silently swallowed.
- Strictly additive: no change to any existing contract or module.

**Non-Goals:**

- The `state → view` binding and re-commit — that is `add-state-binding`, which will `observe` a handle and drive `projection.commit`.
- Delegable/attenuable write authority (grant/delegate/revoke a "can-write" capability) via `capability-authority`. Possession of the owner-validated handle authorizes update in this change.
- A core-owned signal graph / computed values / auto-tracked derivations (a possible later `add-derived-state`).
- Changing `ComponentInstance.value` to be mutable, or wiring state into the component creation context.
- Asynchronous or batched update scheduling.

## Decisions

### D1: A standalone managed-state domain, not a mutation of `ComponentInstance.value`

Add `createStateRuntime(runtime): StateRuntime` (one per runtime, `DuplicateStateRuntimeError` on a second) whose `create<T>(initial)` mints a `StateHandle<T>`. State handles stand alone; an application composes them into components (e.g. a component's `create` closure holds handles) and listeners. **Why:** it keeps the change minimal and additive, avoids re-opening the immutable-`value` contract, and matches the runtime's "explicit coordination" ethos — state is another explicit managed primitive, referenced deliberately, not an implicit field. `ComponentInstance.value` staying immutable-created is preserved.

### D2: Values are strict JSON, normalized and frozen through `createJsonSnapshot`

`create(initial)` and `update(next)` route the value through `createJsonSnapshot`, so a stored value is deeply frozen strict JSON and `read()` returns a frozen value. **Why:** state feeds view attributes and must cross the same immutable-JSON boundary the rest of the architecture enforces (events, interaction snapshots). A non-JSON value (function, class instance, cycle) is rejected with `InvalidStateValueError`, leaving the prior value unchanged and notifying no observer.

### D3: Explicit `update`, synchronous push notification, core-owned

`update(next | (previous) => next)` computes the next value (applying an updater function to the current frozen value), snapshots+freezes it, stores it as the new authoritative value, then notifies observers **synchronously in registration order** with the new value. Notification is a plain array of callbacks the domain owns — no Solid/React/reactive primitive. **Why:** synchronous and explicit is the most deterministic, inspectable shape (PROJECT.md priority #1) and is exactly what a `state-binding` needs to re-commit predictably. The value is committed _before_ observers run, so state is authoritative and consistent even mid-notification.

### D4: The owner-validated handle is the write capability

`StateHandle` is `markRuntimeOwned`, and `read`/`update`/`observe` call `assertActive` (and reject a foreign-runtime handle when it enters another domain via `runtime.assertOwns`). Possession of the live handle authorizes update. **Why:** this mirrors how `ComponentInstance` and `Reference` gate operations, and keeps the first increment small. A separately delegable/attenuable write capability (via `capability-authority`) is a future change if an app needs to hand out write-but-not-read or revocable-write authority.

### D5: Lifecycle and failure handling

`release()` uses the managed-lifecycle controller: it runs cleanups that clear the observer list and drop the held value, sets status released, and is idempotent (the controller dedupes). After release, `read`/`update`/`observe` fail active-only via `assertActive`. A **throwing observer** does not corrupt state (the value is already committed) and does not stop the remaining observers: the update notifies every observer, collects throws, and — if any threw — throws an `AggregateError` after notifying all, so a failing observer is never silently swallowed (PROJECT.md) yet cannot leave observers un-notified or state inconsistent.

## Risks / Trade-offs

- **Re-entrant `update` from inside an observer could recurse without bound.** → Documented as caller responsibility for this increment (the value is already committed before notification, so a re-entrant update is a normal, well-defined update); no guard is added. If it proves a footgun, a re-entrancy guard is a small follow-up.
- **Synchronous notification means a slow observer blocks the `update` call.** → Acceptable and deterministic for the reactive loop; batching/async scheduling is an explicit non-goal here.
- **`AggregateError` from a throwing observer surfaces at the `update` call site, which may be a listener.** → This is intended (failures are not swallowed); `add-state-binding` will treat a binding observer as owned and route its own failures, so a binding's own throw is contained there, not here.
- **A value that is expensive to deep-freeze on every update.** → Same cost the rest of the runtime already pays for JSON snapshots; state values are expected to be small UI state, not large data sets.

## Open Questions

- None blocking. Whether write authority should later become a delegable capability is deferred to a separate change, to be driven by a real need.
