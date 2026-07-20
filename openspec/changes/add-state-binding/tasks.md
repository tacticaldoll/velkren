## 1. State-binding domain

- [ ] 1.1 Add `packages/core/src/state-binding.ts` with `createStateBinding(runtime, projection): StateBinding`, guarded one-per-runtime by a `WeakMap<Runtime, StateBinding>` (throw `DuplicateStateBindingRuntimeError` on a second).
- [ ] 1.2 Define `StateDerivation<T> = (value: T) => RenderNode`, `StateBindingHandle { readonly root: RootHandle; release(): void }`, and `StateBinding { runtime; bind<T>(root, state, derive): StateBindingHandle }`.
- [ ] 1.3 Track bound roots in a `WeakSet<RootHandle>` (or Map) so a second live `bind` on the same root throws `RootAlreadyBoundError`; remove the root on release so it can be rebound.

## 2. Bind, derive, commit

- [ ] 2.1 In `bind`, `runtime.assertOwns(root)` and `runtime.assertOwns(state)`, and `assertActive` both, before any observation.
- [ ] 2.2 Define `apply(value)`: if `root.status` is not active, mark the binding dead and remove the subscription; otherwise `projection.commit(root, derive(value))`.
- [ ] 2.3 Call `apply(state.read())` once (initial sync) before observing, so a throwing initial derive registers nothing.
- [ ] 2.4 `subscription = state.observe(apply)`; return a frozen `StateBindingHandle` whose `release()` marks the binding dead (idempotent via a `live` flag), removes the subscription, and frees the root for rebinding.

## 3. Exports and tests

- [ ] 3.1 Export `createStateBinding`, `StateBinding`, `StateBindingHandle`, `StateDerivation`, `DuplicateStateBindingRuntimeError`, and `RootAlreadyBoundError` from `packages/core/src/index.ts`.
- [ ] 3.2 Add a Node-only core test driving the full loop on the fake renderer: mount a component root; bind a state cell with a derivation; assert the initial derived node is committed; `state.update(...)`; assert the re-derived node is committed (attribute-driven, in place).
- [ ] 3.3 Add tests for: duplicate domain rejection; foreign/released ownership rejection; duplicate-root bind rejection; `release()` stops commits and is idempotent; a state update after the root is released is a no-op that removes the observer (assert the state has no live observer afterward).
- [ ] 3.4 Run the Definition of Done from the project root: `npm run build`, `npm test`, `npm run lint`, `npm run format:check`.
