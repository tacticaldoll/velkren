## 1. State-binding domain

- [x] 1.1 Add `packages/core/src/state-binding.ts` with `createStateBinding(runtime, projection): StateBinding`, guarded one-per-runtime by a `WeakMap<Runtime, StateBinding>` (throw `DuplicateStateBindingRuntimeError` on a second).
- [x] 1.2 Define `StateDerivation<T> = (value: T) => RenderNode`, `StateBindingHandle { readonly root: RootHandle; release(): void }`, and `StateBinding { runtime; bind<T>(root, state, derive): StateBindingHandle }`.
- [x] 1.3 Track bound roots in a `WeakSet<RootHandle>` so a second live `bind` on the same root throws `RootAlreadyBoundError`; remove the root on release so it can be rebound.

## 2. Bind, derive, commit

- [x] 2.1 In `bind`, `runtime.assertOwns(root)` and `runtime.assertOwns(state)`, and `assertActive` both, before any observation (also reject a non-function derivation).
- [x] 2.2 Define `apply(value)`: if `root.status` is not active, mark the binding dead and remove the subscription; otherwise `projection.commit(root, derive(value))`.
- [x] 2.3 Call `apply(state.read())` once (initial sync) before observing, so a throwing initial derive registers nothing.
- [x] 2.4 `subscription = state.observe(apply)` (only while live); return a frozen `StateBindingHandle` whose `release()` marks the binding dead (idempotent via a `live` flag), removes the subscription, and frees the root for rebinding.

## 3. Exports and tests

- [x] 3.1 Export `createStateBinding`, `StateBinding`, `StateBindingHandle`, `StateDerivation`, `DuplicateStateBindingRuntimeError`, and `RootAlreadyBoundError` from `packages/core/src/index.ts`.
- [x] 3.2 Add a Node-only core test driving the full loop on the fake renderer: mount a component root; bind a state cell with a derivation; assert the initial derived node is committed; `state.update(...)` (value and updater-function forms); assert the re-derived node is committed.
- [x] 3.3 Add tests for: duplicate domain rejection; foreign-owned rejection (`OwnershipError`); duplicate-root bind rejection; rebind after release; `release()` stops commits and is idempotent; a state update after the root is released is a no-op that self-heals (a second update still does not derive).
- [x] 3.4 Definition of Done from the project root passes: `npm run build`, `npm test` (387 tests), `npm run lint`, `npm run format:check`.
