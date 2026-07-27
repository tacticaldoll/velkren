## Context

`openspec/specs/view-registry/spec.md`'s "Neutral props channel to a
registered leaf view" requirement states, verbatim: "A registered view SHALL
be a self-contained leaf: the adapter does not render the node's
Velkren-managed children or slots into it. Nesting Velkren-managed children
inside a native view is out of scope for this contract." The archived
`add-view-registry` design doc (`openspec/changes/archive/2026-07-19-add-view-registry/design.md`)
names this exact gap directly: "Nesting managed children inside a native
view (mounting a child projection into the native component via a
portal/ref with lifecycle coordination) is the genuinely hard boundary and
stays deferred." This change is that named follow-up.

Three facts established by reading the current code precisely (not just the
specs) shape the whole design:

1. **`RenderNode.slots` is not reusable for this.** It is a distinct,
   already-existing mechanism (`packages/core/src/template-class.ts`,
   `ResolvedSlot`) for resolving a named template fill to a component
   `Reference` or static content, entirely within `template-runtime.ts`
   before a plan ever reaches an adapter. It is `unconsumed` — zero
   references in any adapter's `src/index.ts`, confirmed by grep. Wiring it
   to _automatically_ drive a nested mount is a separate, larger concern
   (see Non-Goals); this change adds an _explicit_, app-called mechanism
   instead.
2. **Nothing in `RendererPort`/`ProjectionRuntime` can mount into a
   caller-supplied DOM anchor today.** `ProjectionRuntime.#createRoot`
   (`packages/core/src/projection-runtime.ts:140-169`) always calls
   `this.renderer.createRoot(identity, node)`, and every adapter's
   `createRoot` unconditionally creates a _fresh_ per-root container
   appended under its own top-level `host` (or `document.body`). A nested
   child needs a variant that mounts under an _existing_ DOM node instead.
3. **`ProjectionRuntime`'s `releaseAll` assumes a flat set of roots**
   (`projection-runtime.ts:209-224`), not a parent/child tree. A child
   projection's release must be reachable from the _parent root's_ own
   cleanup chain so releasing the parent cascades correctly, which requires
   using the _parent RootHandle's own managed-resource cleanup list_
   (`RootState.addCleanup`, already exposed internally) rather than
   inventing new tree-tracking state.

## Goals / Non-Goals

**Goals:**

- A registered view can expose one or more named "anchors" — DOM
  points inside its own rendered output — that an app can direct a
  separate, genuinely Velkren-managed child component instance's projection
  into, via an explicit `ProjectionRuntime.mountChild` call.
- The mounted child has full identity, interaction, and lifecycle
  isolation, exactly like a top-level root — the _only_ difference from
  `mount` is where its container is anchored in the DOM and that its
  release is additionally tied to its parent root's release.
- Releasing the parent root cascades to release the child projection.
  Releasing the child directly (without touching the parent) also works,
  and either order is idempotent (no double release, no crash on the
  other's later release).
- An _unmodified_ registered view — one that never calls
  `registerAnchor` — is completely unaffected: still a strict leaf, exactly
  as `view-registry` already guarantees.
- Identical mechanism and behavior across Solid, React, and Vue, adapted
  only to how each framework's component-invocation model requires the
  anchor-registration hook to be shaped.
- No `@velkren/core` change beyond the two new methods described above; no
  DOM/JSX/renderer type crosses into core.

**Non-Goals:**

- Automatic `slots`/`Reference`-driven nesting — out of scope, a
  substantially larger, separate mechanism (see Context).
- Mixed-framework nesting (a Vue parent hosting a React child). The parent
  and child in this change always share one adapter/renderer.
- Multiple children sharing one anchor with reconciliation (add/remove/
  reorder) — one `mountChild` call mounts one child projection at one
  anchor. A list of children in one anchor is a further, separate increment.
- Anchors nested more than one level deep are not exercised or tested (the
  mechanism does not structurally prevent it — `mountChild`'s `parent`
  parameter is just another `RootHandle`, and nothing stops a child's own
  RootHandle from later being used as a `mountChild` parent itself — but
  only one level is verified here).

## Decisions

- **`mountChild` is a required `RendererPort` operation**, not optional.
  Consistent with every other port operation (`createRoot`, `commit`, etc.):
  `assertRendererPort` validates all required operations exist, so every
  adapter (and the fake renderer) must implement it even if a given app
  never calls it — matching the existing "an adapter either fully
  implements the port or is rejected" contract, rather than introducing the
  first _optional_ port operation.
- **The app calls `mountChild` explicitly**, mirroring how it already calls
  `mount` explicitly for a top-level projection. This keeps the change's
  core-level surface small and the child/parent relationship fully caller-
  visible (the caller holds both `RootHandle`s), rather than requiring the
  runtime to autonomously discover a child to mount from `slots` resolution
  (the larger, deferred mechanism from Non-Goals).
- **Lifecycle cascade reuses the parent `RootHandle`'s own cleanup chain**,
  not new tree-tracking state. `ProjectionRuntime.mountChild` looks up the
  parent's already-existing `RootState.addCleanup` (the same mechanism
  `#registerInteraction` already uses to bind an interaction registration's
  removal to root release) and registers `() => childProjection.release()`
  on it. Managed-resource cleanups run in reverse (LIFO) order
  (`managed-lifecycle.ts:138`), so a cleanup added _after_ the parent's own
  `removeRoot` cleanup (added when the parent root was first created) runs
  _before_ it on release — the child's content is torn down before the
  parent's own container is removed, the correct order. `release()` is
  already idempotent (`managed-lifecycle.ts:74-83` caches and returns the
  same promise on a second call), so cascade-then-independent-release or
  independent-then-cascade both resolve safely with no double release.
- **`#createRoot`'s adapter-root-creation call is parameterized**, not
  duplicated, so `mount` and `mountChild` share one code path for the
  managed-resource bookkeeping (`RootHandle` allocation, `rootStates`
  registration, cleanup wiring) and differ only in which `RendererPort`
  method actually produces the `AdapterRoot`
  (`renderer.createRoot(identity, node)` vs.
  `renderer.mountChild(parentAdapterRoot, anchor, identity, node)`).
- **No portal API is used in any adapter.** A framework portal
  (`solid-js/web`'s `Portal`, `ReactDOM.createPortal`, Vue's `Teleport`)
  keeps ported content inside the _same_ component tree for context/event
  purposes while only its DOM position moves — but Velkren's own interaction
  capture is already per-root-container native listeners, entirely outside
  each framework's native event/context propagation (per
  `add-neutral-interaction-port`/`refactor-container-anchor`). A child
  projection mounted via `mountChild` is architecturally identical to a
  _second, independent_ top-level root — same per-root container creation,
  same native listener anchor, same commit/identity contract — just
  appended under the anchor element the view exposed instead of under
  `host`. Reusing each adapter's _existing_ root-creation logic
  (parameterized by container) is simpler and more consistent with the
  rest of the codebase than introducing a portal dependency, and Velkren
  never needed framework-level context/event propagation for anything else.
- **Anchor registration is shaped per framework's component-invocation
  model, not forced into one uniform signature:**
  - **Solid** calls a registered view directly
    (`renderNodeElement`'s `view(node.attributes)`), so the adapter can pass
    a second argument: `view(props, context)` where
    `context.registerAnchor(name, element)` records the element against the
    _root currently being rendered_.
  - **React** and **Vue**'s registered views are real components invoked by
    their own reconciler, not called directly by the adapter — there is no
    second call argument to add. Instead, `registerAnchor` is mixed into the
    props object the adapter already builds
    (`createElement(view, { ...node.attributes, registerAnchor })` /
    `h(view, { ...node.attributes, registerAnchor })`). This is a
    non-`JsonObject` extension of the props object passed to the framework
    (not of `node.attributes` itself, which stays pure `JsonObject`), the
    same pattern already used for React's `ref`-based value crossing
    (`add-input-value-binding`). Concretely, the view calls `registerAnchor`
    from a `ref` callback on the element it wants to expose as an anchor
    (a real DOM node does not exist until commit, so this cannot happen in
    the render body itself) — the same "fires on every commit, a fresh
    closure means React/Vue invoke it again" shape already used for the
    value-crossing ref, so the anchor is guaranteed registered by the time
    the adapter's own `flushSync`/`render()` call returns to it.
  - Each adapter stores the anchor map (name → DOM element) keyed by the
    _currently rendering root_, since a `registerAnchor` call must resolve
    to "the parent root a later `mountChild` call names" — implemented as a
    small per-root `Map<string, Element>` alongside each adapter's existing
    internal root-tracking structure (`SolidAdapterRoot`, `ReactAdapterRoot`,
    the Vue adapter's equivalent).
- **`mountChild`'s own root-creation reuses the adapter's _existing_
  per-root container/identity/interaction-listener logic**, just anchored
  under the registered element instead of `host` — so a nested root gets
  the exact same guarantees (identity attribute, commit repair, native
  interaction capture) as a top-level one, with no parallel implementation.
- **A container's interaction listener ignores an event whose nearest
  `PROJECTION_IDENTITY_ATTRIBUTE` ancestor is not itself, to prevent
  double delivery.** Every adapter's `registerInteraction` attaches a plain
  bubble-phase listener to a root's own container
  (`solid-adapter/src/index.ts:175`, `react-adapter/src/index.ts:174`,
  `vue-adapter/src/index.ts:153`), with no `stopPropagation`. That was safe
  when every root's container was a sibling under one shared host; it stops
  being safe once `mountChild` nests a child root's container _inside_ a
  parent's rendered DOM — a click inside the child would keep bubbling
  natively into the parent's own container listener too, double-delivering
  the interaction (or delivering it to a listener that has no business
  seeing it, since it structurally belongs to the child's isolated root).
  The fix reuses the identity attribute already stamped on every container:
  each listener now checks, before processing, whether
  `event.target.closest("[" + PROJECTION_IDENTITY_ATTRIBUTE + "]")` is its
  _own_ container element; if the closest such ancestor is a different
  (necessarily more deeply nested, since bubbling runs target-to-root)
  container, the event belongs to that nested root and this listener
  no-ops. `stopPropagation` was deliberately rejected as the fix: it would
  also block the event from reaching ancestor listeners _outside_ Velkren's
  own territory (arbitrary app-level `document` listeners), a
  side effect this change has no business introducing. The
  `.closest()` check is a no-op for every existing sibling-root scenario
  (the closest identity-bearing ancestor for those was already the
  correct container), so no existing behavior changes — it only adds
  protection for the newly-possible nested case.

## Risks / Trade-offs

- **Nesting a child root's container inside a parent's DOM reopens
  interaction double-delivery** — caught during review, not shipped as a
  latent bug: every adapter's container listener was written assuming
  sibling-only containers and has no `stopPropagation`. Fixed by the
  `.closest()` ancestor-identity check described above, which is inert for
  every pre-existing sibling-root scenario.
- **A view registers an anchor name that a caller's `mountChild` call
  never targets, or vice versa (calls `mountChild` with an anchor name no
  view ever registered)** → the latter is a caller error the adapter must
  reject explicitly (throw) rather than silently mounting nowhere; the
  former is inert (an unused anchor element sits empty) and not a hazard.
- **A view re-renders (a primitive/view-kind change forces a full rebuild
  per `patchNode`'s existing "always rebuild a view" rule) while a child is
  mounted into one of its anchors** — the anchor DOM element itself gets
  destroyed and rebuilt, orphaning the child's mounted content with no
  automatic re-anchoring. Documented as a known limitation for this
  increment (the view-registry's own `patchNode` behavior already rebuilds
  any view-kind node wholesale on _any_ attribute or kind change — nesting
  does not make this worse, it inherits an existing constraint). Not fixed
  here; the acceptance scenarios avoid re-rendering a view that hosts a
  live child.
- **Lifecycle cascade via the parent's cleanup chain could run into
  reentrancy** if a child's own release cleanup somehow re-triggers the
  parent's release → not a realistic path: `release()` on the parent is
  already in `Disposing` status by the time its cleanups run
  (`managed-lifecycle.ts:80`), and cleanups only ever call `release()` on
  the _child_, never back on the parent.
- **New required port operation is a breaking change to any third-party
  `RendererPort` implementation outside this repo** → acceptable: there are
  no external implementers today (all three shipped adapters are in-repo),
  and every prior port-surface addition in this project's history
  (`registerInteraction` itself, added in `add-neutral-interaction-port`)
  was likewise a required, breaking addition to the port contract.

## Migration Plan

Additive to the port contract (a new required method, landing alongside its
implementation in the fake renderer and all three adapters in the same
change, so nothing is ever left non-conforming). No existing method's
signature changes. No rollback beyond reverting the change; no persisted
state is touched.

## Open Questions

None outstanding.
