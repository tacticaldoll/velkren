## Why

Every runtime domain — through render-root projection and layout — is framework-independent and proven only against an in-memory fake renderer. Before higher-level work depends on rendering, one concrete renderer must prove the `RendererPort` boundary is sufficient and that core semantics stay renderer-independent under a real reactive framework. A dependency assessment concluded **adopt narrowly**: SolidJS may be adopted only inside a new adapter package behind `RendererPort`, never in `@velkren/core`.

## What Changes

- Add a new workspace package `@velkren/solid-adapter` that depends on SolidJS and implements the existing `RendererPort`; `@velkren/core` gains no SolidJS, DOM, or reactive dependency and imports nothing from the adapter.
- Add reactive mount/commit/unmount that projects a `RenderPlan` onto a real DOM surface, applying the runtime-assigned permanent identity attribute through the port and repairing it on commit exactly as the fake renderer does.
- Add a native input snapshot boundary: native DOM input and events are captured as immutable snapshots at the adapter edge and translated into runtime semantic events; live DOM nodes and native event objects never cross into the runtime.
- Add deterministic disposal: unmounting a root disposes every SolidJS reactive effect and DOM listener it created, leaving no leaked effects or listeners.
- Add a package-scoped browser-like test environment proving one component mounts, reacts, emits a semantic event, and unmounts cleanly.
- Keep reusable UI breadth, real application components, server rendering, hydration, and any change to core contracts **out of scope**.

## Capabilities

### New Capabilities

- `solid-adapter-prototype`: an isolated SolidJS `RendererPort` implementation with reactive mount/commit/unmount, a native input snapshot boundary, semantic-event emission, and deterministic disposal — proving the renderer boundary without altering core.

### Modified Capabilities

None. The adapter consumes the existing `RendererPort`, `RootHandle`, render-plan, and event contracts without changing their externally observable requirements.

## Impact

- Adds a new package `packages/solid-adapter` with a `solid-js` runtime dependency and its own browser-like test environment and JSX/transform build step.
- Adds no dependency, DOM type, or reactive primitive to `@velkren/core`; the core build and Node-only test suite are unchanged.
- Establishes SolidJS as consumer #2 of `RendererPort` (the fake renderer is #1), validating that the port is not shaped to a single renderer.
