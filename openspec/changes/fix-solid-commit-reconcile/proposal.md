## Why

A commit through the SolidJS adapter currently rebuilds the whole root subtree (`rootContainer.replaceChildren(renderNodeElement(...))`), destroying and recreating every DOM node on every commit. The React and Vue adapters, driven by their frameworks' reconcilers, already preserve DOM node identity across a commit; only the SolidJS adapter does not. This blocks the planned reactive state loop (state → binding → commit): a state-driven re-commit of an unchanged-shape tree would destroy live nodes, discarding focus, caret position, and selection on any element the user is interacting with (e.g. a text field). Fixing the SolidJS adapter to reconcile in place is the prerequisite that lets a future `state → view` binding re-commit without disturbing live elements.

## What Changes

- The SolidJS adapter commits by reconciling the projected tree in place instead of rebuilding it: an unchanged node keeps its existing DOM element across a commit, and only changed attributes and structure are applied.
- Internally, the single whole-tree `createSignal<RenderNode>` + `replaceChildren` render effect is replaced by a `createStore<RenderNode>` updated with `reconcile(next)` on commit, plus a recursive imperative node renderer that creates each element once, applies attributes through a per-node render effect, and manages children with the imperative `indexArray` primitive (index-keyed, matching today's index-as-key semantics).
- Because a `RenderNode` arrives deeply frozen from `template-runtime` and Solid's store writes into its argument, the adapter feeds the store a mutable deep copy of the node (safe because a `RenderNode` is strict JSON); the frozen original is never mutated.
- No JSX is introduced: the adapter continues to build with plain `tsc -b` over `.ts` only, using the imperative `indexArray` / `createStore` / `reconcile` primitives (`createStore` / `reconcile` from `solid-js/store`, a subpath of the existing `solid-js` dependency — no new dependency).
- All existing adapter contracts are preserved: commit-repair of the identity attribute on the per-root container, container-level interaction capture, view-registry leaf rendering, and deterministic disposal.
- Not breaking: the `RendererPort` contract and `@velkren/core` are unchanged; the React and Vue adapters are untouched.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `solid-adapter-prototype`: strengthen the "Reactive mount and commit through the port" requirement so a commit preserves the DOM element identity of unchanged nodes (reconcile in place) rather than rebuilding the subtree, while keeping the existing commit-repair and content-update guarantees.

## Impact

- **Code**: `packages/solid-adapter/src/index.ts` only. `@velkren/core`, `@velkren/element`, and the React/Vue adapters are not touched.
- **Contracts**: no change to `RendererPort` (`commit(root, identity, node)` signature and semantics at the port boundary are preserved).
- **Dependencies**: no new dependency; adds an import of `solid-js/store` (subpath of the existing `solid-js`).
- **Tests**: existing SolidJS adapter, two-editor validation, and membrane suites must pass unchanged; a new adapter test asserts element-identity preservation across a same-shape commit. Verify the existing vitest `inline: ["solid-js"]` config covers the `solid-js/store` subpath when tests run.
- **Deferred (not in this change)**: stable-key reconcile for dynamic/reordering child collections (a future `add-keyed-node-reconcile` adding an optional renderer-neutral `key` to `RenderNode`), and the reactive loop proper (`add-managed-state`, `add-state-binding`).
