## Context

`add-native-nested-views` gave a registered **view** node a way to expose a named anchor
(`registerAnchor(name, element)`), stored per-root in `anchors: Map<string, HTMLElement>`, which
`mountChild(parentRoot, anchorName, childIdentity, childNode)` targets to mount an independent child
root nested under that element. `fix-anchor-replacement-orphaning` hardened this: a rebuilt anchor
host now reparents its mounted child (or disposes it and reports the loss, if the anchor name truly
stops being exposed) instead of silently discarding it.

Separately, `add-template-render-plans` resolves a template's declared `slots: [{name, required?}]`
against supplied fills into `RenderNode.slots: Record<string, ResolvedSlot>` on a **primitive** node —
but confirmed via `grep` across all three adapters, nothing reads `.slots` for anything. It has been
fully inert since it was built. `RenderNode.slots` only contains **filled** slots: a required slot is
guaranteed present (resolution fails otherwise), an optional unfilled slot is simply absent from the
record — so "exactly one entry" means "exactly one slot is currently filled," not "the template
declares exactly one slot."

An earlier design pass (during `/opsx:explore`) considered a "4th coordination domain": an automatic
coordinator that would mount/unmount children whenever a resolved slot reference changed across
`resolvePlan` calls. That was rejected — see Non-Goals.

## Goals / Non-Goals

**Goals:**
- Let a primitive node become a valid `mountChild` anchor target, using its own rendered container as
  the anchor element (no separate placeholder DOM), when its resolved `.slots` has exactly one entry.
- Reuse the existing `anchors` map and `mountChild`/reconciliation machinery unchanged — this is
  purely a second way an entry gets **into** the map, not a new consumption path.
- Preserve every existing behavior for zero-slot and 2+-slot primitives, and for view nodes.

**Non-Goals:**
- No automatic mount/unmount coordinator driven by slot-reference changes across `resolvePlan` calls.
  This would require diffing semantics that don't exist anywhere in the codebase today, has no
  current usage pressure (no template declares more than one slot; nothing currently needs automatic
  remounting), and would extend adapter plumbing for the *entire* primitive-rendering path rather than
  the anchor-registration point alone. The app remains responsible for calling `mountChild` itself,
  exactly as it already is for view anchors.
- No support for a primitive node with two or more resolved slots becoming a multi-named anchor host.
  Nothing in the codebase declares a multi-slot template today; adding this now would be speculative.
  A 2+-slot node is left exactly as it is today (slots resolved, nothing reads them).
- No change to `@velkren/core` or to `RenderNode`/`ResolvedSlot`'s shape — `.slots` already carries
  everything this needs.
- No change to how a **view** node exposes an anchor (`registerAnchor` via 2nd arg / context / inject)
  — that path is untouched; this only adds a second, primitive-node path into the same map.

## Decisions

### A primitive node's own container is the anchor, not a separate placeholder

The alternative — wrapping a single-slot primitive in an extra placeholder element and anchoring
there — would add a DOM node that doesn't correspond to anything the app authored, and would need its
own reconciliation-on-rebuild handling distinct from the node it wraps. Since a primitive node with a
resolved slot already has a real rendered element (the element `kind` itself), registering that
element directly under the slot's name costs nothing extra and needs no wrapper lifecycle.

### Eligibility is "exactly one resolved slot," decided per-commit from `.slots`

`Object.keys(node.slots).length === 1` is checked directly against the node being rendered/patched,
not cached or diffed across commits. This mirrors exactly how a view decides whether to call
`registerAnchor` (a per-render decision, not a persisted flag) and keeps the mechanism stateless: if a
node's fill count changes between commits (e.g., an optional slot becomes filled or unfilled), the
next commit's registration reflects the new shape automatically, with no migration step, because
`mountChild`/reconciliation already tolerate an anchor appearing or disappearing across commits (that
tolerance is exactly what `fix-anchor-replacement-orphaning` hardened).

### A stale registration is actively cleared, not left for containment checks to catch

A first pass of this design assumed a stale slot-anchor entry left in the `anchors` map (because a
node's sole slot renamed or disappeared between commits) was harmless, on the theory that
`reconcileAnchoredChildren`'s DOM-containment check would eventually catch it. That check only fires
for anchor names with a *mounted child* being reconciled, and only detects staleness by the element
being **detached from the DOM** — which is exactly what happens when a view (or a primitive) is
rebuilt, but is *not* what happens here: a patch-in-place keeps the same, still-attached element, so
an old slot name pointing at it stays "live" by the containment check indefinitely. Since `mountChild`
itself only validates that the named element is attached (`root.container.contains(anchorElement)`),
a stale-but-attached name would let a later `mountChild(oldName, ...)` wrongly succeed, mounting into
an element whose current slot fill no longer matches that name. So each adapter tracks, alongside
`anchors`, which slot name (if any) is currently registered *for a given element* via the slot
mechanism (a `WeakMap<HTMLElement, string>`, scoped per root), and on every build/patch of a primitive
node: if that element's previously-recorded name differs from the newly-computed sole slot name (or
disappears), the old `anchors` entry is deleted (only if it still points at this same element, so a
name legitimately reclaimed by something else isn't clobbered) before the new one (if any) is set.

- Solid calls this compare-and-clean logic directly inside `registerSlotAnchor`, invoked explicitly on
  both the build and patch-in-place paths (see below) — no reliance on any callback-refiring behavior.
- React's inline `ref` callback is a fresh closure every render, which React's documented callback-ref
  semantics re-invoke (old ref called with `null`, then the new ref called with the element) whenever
  the ref's function identity changes — independent of whether the underlying DOM node itself was
  reused. The `null` branch is no longer a bare no-op: it runs the same compare-and-clean logic for its
  own closure's node before the new ref registers the new one.
- Vue's `ref` prop is handled the same way as React's for this design, on the expectation that Vue's
  vnode-ref reconciliation likewise re-invokes a changed ref function against a reused element. This
  expectation is verified empirically by a dedicated test (rename/remove a sole slot across a
  patch-in-place commit with no rebuild) rather than assumed from framework internals alone — exactly
  how the prior `fix-anchor-replacement-orphaning` change caught its own stale-reference bug by a
  failing test, not by review alone. If the assumption doesn't hold for Vue, the same per-root
  `WeakMap<HTMLElement, string>` compare-and-clean logic is invoked directly from `buildVNode`'s
  primitive branch instead (which unconditionally runs every commit, independent of Vue's own patch
  decisions), the same way Solid's explicit call sites do.

### Solid registers on both the build path and the patch-in-place path

Solid's `renderNodeElement` (initial build) and `patchNode` (same-`kind` patch) are two distinct code
paths reachable for the same logical node across its lifetime — a node can be built once, then
patched in place many times without ever being torn down and rebuilt, unlike a view node (which Solid
always rebuilds unconditionally on every commit). Since slot-fill status can change on a patch-in-place
commit while `kind` stays constant, registration must happen on both paths, or a node that becomes
eligible only after its first render would never expose an anchor. React and Vue don't have this
split: both frameworks decide unmount-vs-patch-in-place internally and either way funnel through the
same `ref` callback attachment/re-invocation, so one registration point suffices for each.

### React attaches one `ref` callback per element, merging with controlled-value handling only when both apply

React's primitive path today attaches a `ref` callback *only* for controlled-value elements
(`input`/`textarea`/`select` carrying a `value` attribute) — a plain element with a resolved slot (the
common case; slots are not restricted to form controls) currently gets no `ref` at all. This change
attaches a `ref` whenever *either* concern applies (controlled value or a sole resolved slot), doing
both in the same callback when an element happens to need both, so neither risks silently overwriting
the other by attaching two separate `ref` props to the same element (React keeps only the last one).
Vue's primitive path has no existing `ref` usage at all (native value binding needs zero adapter code,
per the existing "native renderer already satisfies value-crossing" requirement), so no merge concern
exists there — a plain new `ref` prop, added only when a sole slot name is present, is sufficient.

### `anchors` threads as a parameter in Solid; via closure in React/Vue

Solid's `renderNodeElement`/`patchNode` already receive `anchors` as an explicit parameter (Solid has
no context primitive convenient for this in the adapter's imperative render functions), so slot-anchor
registration is just another call using the same parameter. React's `VelkrenTree` and Vue's
`VelkrenTree` component currently thread `anchors` to their own top-level scope but do not pass it into
`renderNode`/`buildVNode`; both gain a new parameter threaded through the recursive children call, so
the primitive branch's `ref` callback can close over it — no new context/inject key is introduced,
since a plain function parameter is simpler than a second context channel doing the same job as the
existing anchors-carrying closure.

## Risks / Trade-offs

- **A primitive node's slot-fill status flips every commit (thrash)** → mountChild is only ever called
  explicitly by the app, so a flapping registration with no corresponding `mountChild` call is inert
  (an unused map entry, later overwritten or left stale until reconciliation's containment check drops
  it) — no different from a view registering an anchor no one ever mounts into.
- **Confusing a 2+-slot primitive's silent non-registration for a bug** → documented explicitly in the
  proposal and spec as an intentional exclusion, not a gap, so a future reader doesn't "fix" it as an
  oversight without re-deriving the same non-goal reasoning.
- **React's merged `ref` callback silently drops one behavior if written carelessly** → mitigated by
  writing the merge as a single callback invoking both concerns unconditionally (apply controlled value
  if applicable, register slot anchor if applicable) rather than an if/else that picks one.
