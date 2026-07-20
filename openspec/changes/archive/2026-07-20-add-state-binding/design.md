## Context

Two of the three reactive-loop segments now exist. `managed-state` provides a `StateHandle` with `read()`, `update()`, and `observe(observer)` (synchronous, core-owned notification). `render-root-projection` provides `ProjectionRuntime.commit(root, node)`, and after `fix-solid-commit-reconcile` a commit reconciles the SolidJS DOM in place. The missing segment is the coordinator that observes a state and re-projects: `interaction → event → listener → state → [ ? ] → commit`.

`interaction-binding` is the shape to mirror: a per-runtime coordinator created over the runtime and the projection that maps an input to a domain action, validates ownership, and drives another domain (there, `events.dispatch`). `state-binding` is its symmetric twin on the output side — it maps a state value to a `RenderNode` and drives `projection.commit`.

`PROJECT.md` constrains this: runtime state is authoritative and renderers are one-way projections; no renderer-native or reactive-library type may appear in a framework-independent contract; coordination is explicit; cleanup is deterministic.

## Goals / Non-Goals

**Goals:**

- A per-runtime `state-binding` domain that binds a `StateHandle` to a projected `RootHandle` via a pure `derive: (value) => RenderNode`, commits the derived node initially, and re-commits on every state change.
- Owner-validated: the runtime must own both the root and the state; a root already bound is rejected.
- Deterministic cleanup: `release()` stops observing; releasing the state clears observers; a change after root release is a no-op that removes the dead subscription.
- Core-owned reactivity only: the sole reactivity is `StateHandle.observe`; the contract exposes no renderer/reactive type.
- Additive and core-only: no change to existing modules, `RendererPort`, or adapters.

**Non-Goals:**

- Caret-stable, editable **text-input value binding** across adapters. Driving an `<input>`'s live value from state without breaking editing is adapter-specific (React treats `value` as controlled/read-only without `onChange`; setting `.value` on commit can move the caret). It is a separate follow-up (`add-input-value-binding`), not the loop.
- Partial / attribute-scoped bindings. This change derives and commits the whole root node; deriving just an attribute or subtree is a later refinement.
- Derived/computed state or multi-state bindings (deriving from more than one handle).
- Any change to how `projection.commit` or the adapters apply a node.

## Decisions

### D1: A coordinator mirroring interaction-binding, using the public `projection.commit`

`createStateBinding(runtime, projection): StateBinding` (one per runtime; `DuplicateStateBindingRuntimeError` on a second). `bind<T>(root, state, derive)`:

1. `runtime.assertOwns(root)` and `runtime.assertOwns(state)`, both `assertActive`; reject a root that already has a live binding with `RootAlreadyBoundError`.
2. Define `apply(value)`: if the root is no longer active, mark the binding dead, remove the subscription, and return; otherwise `projection.commit(root, derive(value))`.
3. Call `apply(state.read())` once to sync the view to current state (before observing, so a failure registers nothing).
4. `subscription = state.observe(apply)` and return a frozen `StateBindingHandle { root, release() }`.

**Why the public `commit` and not the internal projection accessor:** committing is already a public `ProjectionRuntime` operation, and `commit` itself validates root ownership and activity. So the coordinator needs no privileged projection access, which keeps this change purely additive (no `projection-runtime.ts` change), unlike `interaction-binding` which needed the accessor to wire the port's interaction registration.

### D2: The derivation is a pure `(value) => RenderNode`

The application supplies `derive`; the domain never inspects renderer state. This keeps the contract renderer-neutral and the derivation testable in isolation. A throwing `derive` on the initial `apply` propagates from `bind` (nothing was registered); a throwing `derive` during a later update propagates out of `state.update` (the state value is already committed by `managed-state`, and `state.update` surfaces observer throws) — the binding stays registered, so a transient derive error does not silently kill the binding.

### D3: Deterministic cleanup without a projection change

Three teardown paths, all clean:

- **Binding released** (`handle.release()`): removes the subscription; idempotent via a `live` flag.
- **State released**: `managed-state` clears its observer list on release, so the subscription is dropped automatically.
- **Root released first**: the next `apply` sees `root.status !== Active`, marks the binding dead, and removes its own subscription — self-healing. (Because `projection.commit` would otherwise reject a released root, the status check both prevents the error and cleans up.)

A per-root release hook on the projection would make the root-first path eager rather than lazy, but it would require changing `projection-runtime.ts`; the lazy self-heal plus state-release cleanup covers the real teardown orders (an app releases the component/state), so it is deferred.

### D4: One binding per root

A projected root's view is derived from a single state binding; a second `bind` on the same active root is rejected (`RootAlreadyBoundError`). Releasing the binding frees the root to be bound again. This prevents two states silently fighting over one root's projection.

## Risks / Trade-offs

- **Lazy root-first cleanup leaves a live observer until the next update or state release.** → Covered for real teardown orders (state release clears observers); the self-heal removes it on the next change. If an app releases roots but keeps states long-lived, a follow-up can add an eager projection release hook.
- **`derive` returning a node of a different root kind rebuilds the element** (per the reconcile rules). → Intended; state may legitimately change the root shape. Fixed-shape state changes (the common case) preserve elements.
- **A slow or throwing `derive` blocks/propagates through `state.update`.** → Acceptable and explicit; `derive` is app code expected to be a cheap pure function.
- **Initial commit on bind replaces the template-mounted node.** → Intended: once state-bound, state is the source of the root's view. Documented so callers expect the initial sync.

## Open Questions

- None blocking. Whether partial (attribute-scoped) bindings or an eager projection release hook are worth adding will be driven by real use.
