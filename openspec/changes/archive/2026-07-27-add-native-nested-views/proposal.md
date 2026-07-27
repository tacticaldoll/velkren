## Why

The view registry lets an app opt a node into a framework-native UI-library
component, but today every registered view is a strict leaf: the adapter
renders it from the node's `attributes` alone and never projects the node's
Velkren-managed children into it — a requirement the `view-registry` spec
states explicitly ("Nesting Velkren-managed children inside a native view is
out of scope for this contract"). Real UI needs the opposite for cases like
a native Dialog: a UI-library component that must host genuinely
Velkren-managed content — its own component instance, with its own
lifecycle, identity, and interaction isolation — inside the native
component's own DOM structure. The `add-view-registry` change's own design
doc named this exact gap "the genuinely hard boundary" and deferred it on
purpose; this change is that named follow-up.

## What Changes

- **`@velkren/core` gains a new `RendererPort` operation**:
  `mountChild(parent: AdapterRoot, anchor: string, identity: string, node:
RenderNode): AdapterRoot`. It is a required port operation (validated by
  `assertRendererPort`, implemented by the fake renderer and all three
  adapters), analogous to `createRoot` but anchored to an already-existing
  parent root at a named point instead of the adapter's top-level host.
- **`ProjectionRuntime` gains `mountChild(parent: RootHandle, anchor: string,
instance: ComponentInstance, plan: RenderPlan): Promise<Projection>`.**
  The app calls it explicitly (mirroring the existing `mount`) once it has
  created a child component instance and resolved its plan; the runtime
  ties the resulting child `Projection`'s release into the _parent root's_
  own cleanup chain, so releasing the parent cascades to release the child,
  while the child can also be released independently and remains idempotent
  either way.
- **A registered view can declare it exposes a named anchor**, so the
  adapter knows where to mount a child projection a caller directs there via
  `mountChild`. Each adapter's own component-invocation model shapes how:
  Solid's view function (called directly by the adapter) receives a second
  `context` argument with `registerAnchor(name, element)`. React's and Vue's
  view components are invoked by their own reconciler, not by the adapter,
  so there is no extra call argument to add — `registerAnchor` reaches the
  view through each framework's own context mechanism instead (React's
  `createContext`/`useContext`, Vue's `provide`/`inject`), provided once for
  the whole tree by a small internal wrapper component, rather than mixed
  into the view's props (mixing it into a `JsonObject`-typed props object
  was tried and rejected — it silently breaks assignability of an existing
  view to the new view type; see design.md).
- **`openspec/specs/view-registry/spec.md`'s leaf-only requirement is
  relaxed, not removed**: an _unmodified_ registered view remains exactly
  the leaf it is today (the adapter still never auto-projects
  `node.children`/`node.slots` into it) — nesting is strictly opt-in, only
  through an anchor a view explicitly registers and only through an explicit
  `mountChild` call, never automatic.
- **BREAKING**: none. `SolidView`/`ReactView`/`VueView`'s existing one-
  argument shape remains callable exactly as before (a JS function ignores
  extra arguments/props it doesn't destructure, and TypeScript's function
  variance accepts a narrower existing view type where the wider new type is
  expected); an existing registered view that never calls `registerAnchor`
  behaves identically to today.

## Capabilities

### New Capabilities

<!-- none: this extends render-root-projection and view-registry -->

### Modified Capabilities

- `render-root-projection`: `RendererPort` gains the required `mountChild`
  operation; `ProjectionRuntime` gains a `mountChild` method that mounts a
  child projection anchored to a parent root and cascades the parent's
  release to the child.
- `view-registry`: a registered view may opt into hosting a managed child
  projection by registering a named anchor; an unmodified view remains a
  strict leaf exactly as before.
- `solid-adapter-prototype`, `react-adapter`, `vue-adapter`: each implements
  `mountChild` and threads an anchor-registration mechanism through its view
  invocation, per its own component-invocation model.

## Impact

- **Code**: `packages/core/src/renderer-port.ts` (new port operation),
  `packages/core/src/projection-runtime.ts` (new `mountChild` method, shared
  root-creation refactor), `packages/core/src/fake-renderer.ts` (implements
  `mountChild` for tests). `packages/solid-adapter/src/index.ts`,
  `packages/react-adapter/src/index.ts`, `packages/vue-adapter/src/index.ts`
  each implement `mountChild` and the anchor-registration mechanism.
- **APIs**: `RendererPort` and `ProjectionRuntime` each gain one new method
  (additive, not a signature change to any existing method). `SolidView`
  gains an additional, ignorable second call argument. `ReactView`/`VueView`
  are completely unchanged; the new mechanism reaches a view through each
  framework's own context channel (`RegisterAnchorContext`/
  `REGISTER_ANCHOR_KEY`, both newly exported) instead of a prop.
- **Dependencies**: none added.
- **Non-Goals**: no automatic resolution of a nested child from
  `RenderNode.slots`/a `Reference` fill — `slots` already exists in core as
  a distinct, currently-unconsumed mechanism for resolving a named template
  fill to a component reference, and wiring it to automatically drive
  `mountChild` is a separate, larger concern this change does not attempt;
  the app calls `mountChild` explicitly. No mixed-framework trees (a Vue
  parent hosting a React child, etc.) — the parent and child share one
  adapter. No more than one level of nesting is exercised or tested (nothing
  in the mechanism itself limits deeper nesting, but only one level is
  proven). No stable-key reconciliation for multiple children in one
  anchor — a first increment mounts one child projection per anchor call.
