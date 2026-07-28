## Context

`RenderNode`'s children are reconciled by position everywhere today: React/Vue adapters pass `String(index)` as each child's framework key, and the SolidJS adapter's `patchChildren` (`packages/solid-adapter/src/index.ts`, added by `fix-solid-commit-reconcile`) patches `parent.children[i]` against `oldChildren[i]`/`newChildren[i]` strictly by index — there is no `mapArray`/`indexArray`/keyed helper from `solid-js` in use; the whole reconcile step is hand-rolled DOM patching, consistent with this adapter's no-JSX, store-free approach. Positional reconciliation is exactly right for a fixed-shape tree (the only case that has existed until now) and exactly wrong the moment a list's length or order changes at runtime.

The actual motivating caller is `add-state-binding`'s `derive(value) => RenderNode`, invoked directly by `state-binding.ts`'s `apply()` and hard-committed via `projection.commit(root, derive(value))` with **no core-level shape validation at that call site at all** — `ProjectionRuntime.commit` forwards the node straight to `RendererPort.commit`. This is the same boundary precision `attributes`/`kind` already have (a hand-built `RenderNode` passed to `commit` today is not strict-JSON-checked either; only the template-authoring path through `#buildNode` validates that). Any `key`-consistency validation this change adds to `freezeNode` therefore protects the **template-authoring path only** — a real, but partial, guarantee — not the state-binding-derived path, which is the path an actual reordering list runs through.

## Goals / Non-Goals

**Goals:**
- Preserve each list item's DOM element (and therefore focus/caret/scroll position) across an insert, remove, or reorder, on all three adapters, when render nodes carry a stable `key`.
- Keep an unkeyed tree (every list that exists today) completely unaffected — zero behavior change, zero perf cost beyond one `.every()` scan per `patchChildren` call.
- Let React and Vue's own reconcilers do the actual keyed diffing; only SolidJS needs new reconciliation code, since it has no framework-level child reconciler in this adapter.

**Non-Goals:**
- No validation of `key` consistency at the `projection.commit`/`RendererPort.commit` boundary — matching the existing unchecked posture of `attributes`/`kind` at that same boundary. A duplicate key or a mixed keyed/unkeyed sibling list reaching an adapter through a hand-built `RenderNode` (e.g. from a `state-binding` derivation) is undefined, adapter-specific behavior, not a contract this change guarantees.
- No minimal-move-count optimization for the SolidJS keyed diff — a correct O(n) key-matched reconcile with a straightforward reorder pass, not a longest-increasing-subsequence-based minimal-move algorithm.
- No change to `RendererPort`, `mountChild`/anchors, or any lifecycle/ownership semantics.
- Mixed-framework trees remain out of scope (unchanged from `add-native-nested-views`).

## Decisions

**`key` lives on both the primitive and view node variants**, not just the primitive one, since either can appear as an item in a reconciled children array (a list of registered-view cards is exactly as plausible as a list of primitive rows).

**Structural validation lives in `freezeNode` (template-authoring time), not `#buildNode` (per-resolution time).** A children array's shape (which siblings declare a `key`) is part of the *authored template structure*, fixed once at `createTemplateClass` time — it does not vary per `resolvePlan` call the way slot fills do. Validating once at definition time is strictly more useful than re-validating identically on every resolution, and mirrors where the existing duplicate-slot-name check already lives in the same function.

**The state-binding-derived path stays unchecked, by design, not by oversight.** `derive(value) => RenderNode` results reach `RendererPort.commit` with no core-side shape validation today (verified by reading `state-binding.ts` and `projection-runtime.ts`'s `commit`) — the same is true of `attributes`, `kind`, `children`, and every other `RenderNode` field a caller could hand-construct directly. Adding a special-case runtime check for `key` alone at that boundary, on a call site that fires on every state change (a genuine hot path), would be inconsistent with the existing boundary and a real perf cost for no matching guarantee anywhere else on the same object. Each adapter is written defensively enough not to corrupt unrelated state on a malformed input (see Risks), but does not promise a specific recovery shape for a duplicate key, matching how React and Vue themselves only warn (not guarantee correctness) on a duplicate key today.

**React and Vue adapters change one line each**, delegating to their own established keyed-reconciliation: passing the real `key` (falling back to `String(index)` when absent, preserving today's behavior for an unkeyed list) is sufficient because both frameworks already diff their internal element/vnode trees by key across a full rebuild-and-reconcile pass — this is the same reasoning `add-input-value-binding` used for why Vue needed no source change for value-binding: the framework's own machinery already does the right thing once given the right input.

**SolidJS gets a real keyed-diff `patchKeyedChildren`, gated by "is this children array fully keyed."** Detection: `children.length > 0 && children.every(c => c.key !== undefined)`. If either the old or the new children array is fully keyed, the keyed path runs; otherwise (including any mixed list, which the template path already rejects and the state-binding path leaves undefined) the existing positional path runs completely unchanged. The keyed path:
1. Index the old children by key (`Map<key, {node, element}>`, reading `parent.children[i]` for each keyed old child).
2. For each new child: on a key match, `patchNode` the existing element (removing it if `patchNode` decided to rebuild, i.e. returned a different element) and record the (possibly new) element in reconciled order; on no match, build fresh via `renderNodeElement`.
3. Remove any old keyed element whose key was not reused.
4. Reorder the surviving/new elements into place with a single `insertBefore` pass driven by `parent.firstChild`/`nextSibling` walking (standard "move only what's out of place" reorder, not minimal-move-optimal, but correct and O(n)).

## Risks / Trade-offs

- **A duplicate key within one keyed `children` array, reaching an adapter through an unchecked `commit()` call, is not given a specified outcome** by this change (see Non-Goals) → mitigated only to the extent that no adapter crashes; the visible result (which of the duplicate rows "wins" a given DOM position) is left adapter-specific, exactly as accepted for other unchecked `RenderNode` fields today.
- **The SolidJS keyed reorder pass is O(n) with a `Map`, not minimal-move** → acceptable per Non-Goals; correctness (right element, right final position) holds regardless, only DOM-move-count is unoptimized.
- **`freezeNode`'s new sibling-consistency check only protects the template-authoring path** → the design doc states this plainly rather than implying broader protection than the implementation actually gives.

## Migration Plan

Single change, single PR: add the `key` field and template-time validation in `@velkren/core`, then update all three adapters' child-reconciliation code and add tests proving element/focus preservation across insert/remove/reorder for each. No feature flag — `key` is optional and additive; every existing unkeyed tree is provably unaffected.
