## Context

After `refactor-container-anchor`, both adapters anchor identity and the interaction
listener on the per-root container, so the rendered node (root or child) no longer
carries the anchor. React's `renderNode` (react-adapter/src/index.ts:193) is now uniform
— interaction wiring was removed — and renders `createElement(node.kind, props, …)` for
every node. Solid renders the root content element in `createRoot`
(solid-adapter/src/index.ts:59, `document.createElement(node.kind)`) and children in
`buildElement` (:177). The missing piece — a native view for a node, including the root
— is entirely in these adapter render paths. `@velkren/core` stays neutral.

## Goals / Non-Goals

**Goals:**

- An adapter view registry that resolves `kind` to a framework-native view, falling
  back to primitives, applying to any node including the root.
- Keep `@velkren/core` unchanged and framework-neutral.
- Primitives remain the zero-config default.

**Non-Goals:**

- No bundled UI-library bindings.
- No nesting of Velkren-managed children inside a native view (deferred).
- No `@velkren/core` change; no typed view-props contract; no Vue.

## Decisions

### D1: The registry lives in the adapter; a `createElement` pre-check for every node

`createSolidRenderer`/`createReactRenderer` gain an optional options bag with a `views`
map (`Record<string, View>`), alongside the existing `container`. Before
`createElement(node.kind)`, the adapter looks up `views[node.kind]`: a hit renders the
registered view; a miss falls through to the unchanged primitive path. Because identity
and interaction now live on the container (`refactor-container-anchor`), the check
applies to **every** node, root included — no special-casing. The registry check MUST
sit **before** the primitive attribute handling (React's `translateAttribute`/
`stringifyAttribute`, Solid's `applyAttributes`) so a registered view receives the raw
`node.attributes` as props, not `className`-translated / JSON-stringified DOM attributes.

React: one check in `renderNode`; React re-renders the whole tree via `flushSync` on
every commit, so a registered view gets fresh props each commit for free.

Solid needs more than "factor the creation helper", because today the root content
`element` is created once and then **mutated** each commit by `renderInto` (which writes
`applyAttributes` and `replaceChildren` on it) — that would corrupt a registered view
(props written as DOM attributes, the view's own children wiped) and never update it.
The fix: a shared registry-aware helper produces the content element from a node
(registered view **or** primitive, as a self-contained leaf), and the root's render
effect **rebuilds** the content into `rootContainer` each commit
(`rootContainer.replaceChildren(helper(current()))`) instead of `renderInto`-mutating a
fixed element. This is uniform with `buildElement`, disposes correctly (the render
effect re-runs within the root's reactive owner), and gives a registered root view the
same per-commit prop refresh React has. A registered leaf view is assumed to render a
single top-level element (like a primitive); `simulateInteraction` continues to dispatch
from that element and bubble to the container listener. The `View` type is
framework-specific and defined per adapter; `@velkren/core` never references it.

### D2: `kind` is the view id; `attributes` is the neutral props channel (option 1)

A node's `kind` doubles as the view id and its `attributes` (`JsonObject`) are the
registered view's props. **Why over a distinct core `{ viewId, props }` node (option 2)**: zero core change; proves the mechanism end-to-end. Cost: `attributes` is dual-use
(HTML attributes for primitives, props for views). Because the React adapter test suite
fails on any `console.error`/`console.warn`, a registered view must **consume** its
props (not blind-spread the raw `JsonObject` onto a host element, which would trip
React's unknown-prop warning). Option 2 (a typed props node in core) is the named
follow-up.

### D3: Leaf scope for registered views

A registered view is self-contained: the adapter passes it the node's props but does
not render the node's Velkren-managed children/slots into it. Nesting managed children
inside a native view (mounting a child projection into the native component via a
portal/ref with lifecycle coordination) is the genuinely hard boundary and stays
deferred. Leaf views — including a native view as a component's whole root — already
unlock the large majority of practical UI.

### D4: Core neutrality preserved

`@velkren/core` continues to emit only neutral `RenderNode`s; the adapter maps a neutral
`kind` to a framework view internally and never returns a framework type to core. The
registry is an adapter capability, so the "renderer-specific types do not appear in core
contracts" invariant holds without any core edit.

## Risks / Trade-offs

- **[Dual-use of `attributes`, and React's console guard]** For a primitive, attributes
  are HTML attributes; for a registered view, props. A view blind-spreading raw
  attributes trips React's unknown-prop warning (a hard test failure). → Test views must
  consume their props; documented; option 2 is the follow-up.
- **[A registered `kind` shadows an HTML tag]** Registering `"button"` overrides the
  primitive `<button>`. → Intended override semantics; apps choose non-colliding ids
  (`"ui.button"`) when they want both.
- **[Leaf-only]** Native views cannot hold Velkren children yet. → Explicit non-goal and
  named follow-up.
- **[Solid rebuild coarsens fine-grained update]** Rebuilding the root content via
  `rootContainer.replaceChildren(...)` each commit re-creates the root content element
  (the shipped code already rebuilt all _descendants_ each commit; this adds the root
  element), so a root `<input>`'s focus/selection is not preserved across a commit. →
  Accepted as a prototype simplification (uniform primitive/view handling, no
  primitive↔view transition bookkeeping); it is spec-conformant (reactive commit still
  reflects the new node) and narrow (root-element focus across commits only). If focus
  preservation is ever required, branch primitive-vs-view so only view-kind roots
  rebuild — a named follow-up.

## Migration Plan

In-repo only; depends on `refactor-container-anchor` (on `main`).

1. React: add the `views` option; consult `views[node.kind]` in `renderNode` before the
   `translateAttribute`/`stringifyAttribute` loop and `createElement` (leaf: render the
   registered component with raw `attributes` as props, no children into it).
2. Solid: add the `views` option; introduce a shared registry-aware helper that produces
   a node's content element (registered leaf view or primitive); use it in `buildElement`
   and have the root render effect rebuild the content into `rootContainer` each commit
   via that helper (not `renderInto`-mutation), so a registered root view is correct and
   updates on commit; a registered view's effects dispose with the render-effect re-run.
3. Adapter tests (both): a registered view renders in place of the primitive with
   attributes as props (views consume props); a miss falls back; with no `views`
   unchanged; a registered view at the **root** renders and, with an interaction bound,
   an interaction on it bubbles to the container and delivers through the port.
4. Run the full Definition of Done; sync the `view-registry` capability and the two
   adapter deltas; archive (running the DoD again after sync).

Rollback is a straight revert; no persisted state.

## Open Questions

- Promote to a distinct core view node `{ viewId, props, slots }` (option 2) with a
  typed props contract? Deferred until the mechanism proves out.
- Native views holding Velkren-managed children (the nesting boundary)? Deferred to its
  own change.
