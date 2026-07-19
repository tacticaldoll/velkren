## Why

Velkren renders neutral `RenderNode` primitives (a `kind` tag + attributes) — a
portable default. But `kind` is only ever an HTML tag rendered via `createElement`, so
a component's view can never be a framework-native component from a UI library (MUI,
Radix, a date picker). Now that `refactor-container-anchor` has moved the runtime's
identity and interaction anchor onto the per-root container, a registered native view
can occupy **any** node — including a component's root — without disturbing the anchor.
This change adds the open seam: an adapter **view registry** that resolves a node's
`kind` to a registered native view, falling back to primitives. Primitives stay the
zero-config default (strategy A); native views become a user registration (strategy B)
— one mechanism, the constitutional "expose composition through public contracts, not
private override points."

## What Changes

- Each `RendererPort` adapter (SolidJS, React) gains an optional **view registry**: a
  `views` map from a node `kind` string to a framework-native view. Node rendering
  consults the registry first, for **every** node including the root, and falls back to
  the primitive `createElement(kind)` path on a miss.
- A registered view receives the node's `attributes` (a neutral `JsonObject`) as its
  props; the adapter renders the native component with them. Registered views are
  **self-contained leaves** — the adapter does not render the node's Velkren-managed
  children/slots into a native view (that nesting boundary is deferred).
- `@velkren/core` still emits only neutral nodes and never sees a framework view; the
  registry lives entirely in the adapter (`kind` is the view id, `attributes` the
  neutral props channel).
- No UI-library bindings are shipped — only the registry mechanism.

## Capabilities

### New Capabilities

- `view-registry`: a renderer-adapter contract by which a node's `kind` resolves
  through a registry of framework-native views (receiving the node's attributes as
  neutral props) and falls back to primitive rendering on a miss — applying to any
  authored node including the root — while `@velkren/core` stays framework-neutral.

### Modified Capabilities

- `solid-adapter-prototype`: the SolidJS adapter consults an optional view registry for
  every node before its primitive path.
- `react-adapter`: the React adapter consults an optional view registry for every node
  before its primitive path.

## Impact

- **Code**: `packages/solid-adapter/src/index.ts` (a `views` option; a registry check in
  the root creation and `buildElement` paths) and `packages/react-adapter/src/index.ts`
  (a `views` option; a registry check in `renderNode`, now uniform after the
  anchor refactor). Adapter tests gain view-registry coverage on both adapters,
  including a registered view at the root. **No `@velkren/core` change.**
- **APIs**: `createSolidRenderer`/`createReactRenderer` gain an optional `views` option
  (every existing call site is no-arg, so nothing else changes).
- **Dependencies**: none. **Depends on** `refactor-container-anchor` (container anchor,
  already on `main`).
- **Non-goals**: no bundled UI-library bindings; no nesting of Velkren-managed children
  inside a native view (deferred); no `@velkren/core` change; no typed view-props
  contract (attributes carry props untyped for now); no Vue.
