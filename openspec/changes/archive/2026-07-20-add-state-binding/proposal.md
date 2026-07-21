## Why

`add-managed-state` gave the runtime mutable, observable state, and `fix-solid-commit-reconcile` made a commit preserve DOM nodes. What is still missing is the segment that turns a state change into an updated view: nothing observes a `StateHandle` and re-projects. This change adds that coordinator, closing the reactive loop `interaction → event → listener → state → binding → commit` end to end, so an application can drive a projected view from runtime state.

## What Changes

- Add a **state-binding** domain: `createStateBinding(runtime, projection)` returns a per-runtime `StateBinding` whose `bind(root, state, derive)` ties a `StateHandle` to a projected `RootHandle` through a pure derivation `derive: (value) => RenderNode`.
- On `bind`, the coordinator derives the node from the state's current value and commits it once (syncing the view to state), then observes the state and re-commits the derived node on every change — through the public `projection.commit(root, node)`, so the SolidJS in-place reconcile keeps unchanged DOM nodes.
- The derivation is a pure `(value) => RenderNode`; no renderer-native or reactive-library type appears in the domain's contract. Reactivity comes only from the core-owned `StateHandle.observe`.
- `bind` validates that the runtime owns both the root and the state, rejects binding a root that already has an active binding, and returns a `StateBindingHandle` whose `release()` stops observing. Cleanup is deterministic without a projection change: releasing the state clears its observers, and a change delivered after the root is released is a no-op that removes the now-dead subscription.
- Additive and core-only: no change to `@velkren/core`'s existing modules, `RendererPort`, or any adapter.

## Capabilities

### New Capabilities

- `state-binding`: an owner-validated coordinator that derives a `RenderNode` from a `StateHandle` value and commits it on every state change, driving a projected view from runtime state with a pure derivation and no renderer/reactive types in its contract.

### Modified Capabilities

<!-- none -->

## Impact

- **Code**: new `packages/core/src/state-binding.ts`; new public exports from `packages/core/src/index.ts`. No existing module changes; uses the public `ProjectionRuntime.commit` and `StateHandle.observe`.
- **Contracts**: additive only.
- **Dependencies**: none new; composes `managed-state`, `render-root-projection`, and (at runtime) the SolidJS in-place reconcile from `fix-solid-commit-reconcile`.
- **Tests**: a Node-only core suite driving the full loop on the fake renderer — bind commits initial state, a state update re-commits the derived node, ownership and duplicate-bind rejection, and release/root-release cleanup.
- **Deferred (not in this change)**: caret-stable, editable **text-input value binding** across adapters (a `value` prop without `onChange` renders read-only in React; setting `.value` on commit can move the caret). This is an adapter-spanning widget concern, not the loop itself; it becomes a follow-up `add-input-value-binding`. Also deferred: partial/attribute-scoped bindings (this change derives the whole root node), and derived/computed state.
