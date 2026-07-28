## Why

Every adapter currently reconciles a `RenderNode`'s children by position: React and Vue pass `String(index)` as the reconciliation key, and the SolidJS adapter's manual `patchChildren` patches strictly by array index. This is correct only for a fixed-shape child list. The moment a `state → view` binding (`add-state-binding`) derives a child list that inserts, removes, or reorders items — the first real use case for a dynamic list — positional reconciliation reuses the wrong DOM element at each shifted position, corrupting focus, caret, and any other per-element live state on whichever row the user is interacting with.

## What Changes

- `@velkren/core`'s `RenderNode`/`TemplateNode` (both the primitive and view variants) gain an optional renderer-neutral `key?: string` field.
- The template-authoring path (`freezeNode`) validates `key` structurally wherever it can: a non-blank string if present, and — within one `children` array — either every sibling carries a key or none do, with no two siblings sharing a key. This mirrors the existing duplicate-slot-name check in the same function.
- React and Vue adapters swap `String(index)` for `child.key ?? String(index)` when building each child's reconciliation key, letting each framework's own existing keyed-diff reconciler do the work — no new reconciliation logic in either adapter.
- The SolidJS adapter's `patchChildren`, which does its own manual DOM patching (no framework reconciler to lean on), gains a real keyed-diff path: when a children array is fully keyed, children are matched by key (not position), reused/patched elements keep their DOM identity across an insert/remove/reorder, and only newly-unmatched keys are built fresh; an unkeyed list keeps today's positional path completely unchanged.
- **Non-goal, stated explicitly**: a hand-built `RenderNode` passed directly to `projection.commit` (as `state-binding`'s `derive(value) => RenderNode` does) is not validated by core for key consistency, the same unchecked-boundary precedent that already applies to `kind`/`attributes` at that same call site. Duplicate keys or mixed keyed/unkeyed siblings reaching an adapter through that path are adapter-specific, best-effort behavior (matching how React/Vue already treat a duplicate key with only a dev warning), not a guaranteed contract.

## Capabilities

### New Capabilities

(none — this is a correctness refinement of the existing render-node reconciliation, not a new capability)

### Modified Capabilities

- `template-render-plans`: `RenderNode`/`TemplateNode` gain the optional `key` field; template-authoring validates key structural consistency among siblings.
- `solid-adapter-prototype`: `patchChildren` reconciles a fully-keyed children array by key instead of position.
- `react-adapter`: child reconciliation key is `child.key ?? String(index)` instead of always `String(index)`.
- `vue-adapter`: child reconciliation key is `child.key ?? String(index)` instead of always `String(index)`.

## Impact

- `packages/core/src/template-class.ts` (`TemplateNode`/`RenderNode` types, `freezeNode`), `packages/core/src/template-runtime.ts` (`#buildNode` carries `key` through unchanged).
- `packages/solid-adapter/src/index.ts` (`patchChildren` gains a keyed path; `renderNodeElement`/`patchNode` unchanged), `packages/react-adapter/src/index.ts` (`renderNode`'s children map), `packages/vue-adapter/src/index.ts` (`buildVNode`'s children map).
- `packages/core/src/renderer-port.ts` and `packages/core/src/state-binding.ts` reference `RenderNode` in their signatures; neither needs a structural change (verified by `tsc`), consistent with `add-typed-view-props`'s prior finding.
- No `@velkren/core` change to the `RendererPort` interface, ownership, or lifecycle semantics.
