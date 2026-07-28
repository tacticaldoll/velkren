## Why

Every adapter already lets a **view** node expose a named anchor that `mountChild` can target, and
`fix-anchor-replacement-orphaning` just hardened that mechanism so a rebuilt anchor host reparents
its mounted child instead of orphaning it. Separately, `RenderNode.slots` (from
`add-template-render-plans`) resolves a template's declared slot fills onto a **primitive** node, but
no adapter reads `.slots` for anything — it has been fully inert since it was built. The two
mechanisms solve adjacent problems (naming a place in the tree to mount into) with no code shared
between them, and a primitive node today has no way to become a `mountChild` target at all. Rather
than inventing a new automatic slot-driven mounting coordinator (considered and rejected — it would
need unbuilt "diffing across `resolvePlan` calls" semantics and has no current usage pressure), the
minimal, non-speculative move is to let a primitive node's own resolved slot shape make it eligible
for the anchor mechanism that already exists, extending anchors to a second kind of host with zero
new triggering machinery.

## What Changes

- A primitive `RenderNode` whose resolved `.slots` record has **exactly one** entry becomes its own
  `mountChild` anchor, registered under that slot's name, using the identical `anchors` map and
  `registerAnchor` plumbing views already use — no new coordinator, no new registry, no automatic
  triggering. The app still calls `mountChild` explicitly, exactly as it does for a view anchor today.
- A primitive node with **zero** or **two-or-more** resolved slots registers no anchor and is
  unaffected; this is an explicit scope boundary, not a gap to close later (no current template
  declares more than one slot).
- A view node continues to expose anchors exactly as before (via `registerAnchor`/context —
  unaffected); this change only adds a second, primitive-node path to the same `anchors` map.
- Solid: registers the slot anchor in both the initial build path and the same-kind patch-in-place
  path, since a node's slot-fill status can change between commits while its `kind` (and thus which
  path Solid's `patchNode` takes) stays the same.
- React/Vue: thread the `anchors` map into the primitive-node rendering path (currently only
  view-node rendering receives it, via context/inject) and register via each framework's own `ref`
  callback, merging into React's existing ref (which already handles controlled-value elements)
  rather than adding a second ref.

## Capabilities

### New Capabilities

(none — this extends the existing per-adapter child-mounting requirement rather than introducing a
new capability domain)

### Modified Capabilities

- `solid-adapter-prototype`: a primitive node with exactly one resolved slot becomes its own anchor,
  registered on both the build and patch-in-place paths.
- `react-adapter`: a primitive node with exactly one resolved slot becomes its own anchor, registered
  via the element's `ref`.
- `vue-adapter`: a primitive node with exactly one resolved slot becomes its own anchor, registered
  via the element's `ref`.

## Impact

- `packages/solid-adapter/src/index.ts`, `packages/react-adapter/src/index.ts`,
  `packages/vue-adapter/src/index.ts`: primitive-node rendering paths gain slot-anchor registration.
- No `@velkren/core` change — `RenderNode.slots` already carries everything needed; this is adapter-only.
- No breaking change: existing views, existing zero/multi-slot primitives, and existing `mountChild`
  callers are unaffected; this only adds a new, opt-in-by-shape way to become an anchor target.
