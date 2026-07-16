## Why

Template render plans describe structure as pure data, but nothing projects them onto a rendering surface. That projection is where DOM identity and renderer integration first appear — and it is exactly where the runtime must NOT let the surface become the source of truth. This change establishes the renderer boundary and observable root identity so a later real renderer (SolidJS) and layout can build on a stable, inspectable projection whose ownership still lives entirely in the runtime.

## What Changes

- Add a framework-independent `RendererPort` contract that a renderer adapter implements; core passes it renderer-neutral render nodes and an identity token and never imports DOM, JSX, or renderer types.
- Add managed `RootHandle` projection: mounting a component instance's resolved render plan produces one owner-validated RootHandle per named root, with an idempotent release that removes the root through the port.
- Add a permanent, runtime-assigned projection identity per root, written to the projected surface as a stable attribute that survives commits and is never derived from selectors or the DOM.
- Add managed commit repair: re-committing a plan re-applies the permanent identity attribute and repairs it if it was removed on the surface.
- Add a framework-provided in-memory **fake renderer** that implements the port for tests, exposing the projected tree and identity for inspection without browser globals.
- Keep real DOM renderers, SolidJS, reactive primitives, layout scheduling, and event wiring **out of scope**; they remain deferred in the backlog.

## Capabilities

### New Capabilities

- `render-root-projection`: the RendererPort contract, managed RootHandle projection, permanent runtime-assigned root identity, managed commit repair, ownership independent of the surface, and a fake renderer — all framework-independent.

### Modified Capabilities

None. Projection consumes the existing render-plan, component-instance, and ownership contracts without changing their externally observable requirements.

## Impact

- Extends the public `@velkren/core` API with the RendererPort contract, projection runtime, RootHandle, projection identity, the fake renderer, and projection-domain errors.
- Reuses the ownership and managed-lifecycle kernels and the template render-plan contract while keeping generic registries and factory kernels out of the public export map.
- Adds no DOM type, JSX, real renderer, reactive primitive, or browser global to core; the surface is reached only through the port.
