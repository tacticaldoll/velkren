## Why

The component runtime creates managed instance trees, but nothing describes how an instance should be structured for a renderer. Renderer adapters must not reach into component internals; they need a stable, inspectable, renderer-neutral description. Template render plans are that description — the last framework-independent layer before any DOM or renderer adapter exists, so template selection, slot resolution, and plan shape must be fixed and explainable before projection is built.

## What Changes

- Add immutable helper-proven `TemplateClass` definitions with canonical `template/<slug>` IDs that declare one bound target ComponentClass, one or more named roots, and named slots within each root.
- Add a runtime-owned template domain that registers templates, enforces at most one active template per bound ComponentClass, and rejects duplicate or ambiguous bindings without last-write-wins.
- Add deterministic resolution: a component instance resolves the single active template bound to its ComponentClass, or fails explicitly when none is bound.
- Add normalized, deeply frozen, renderer-neutral `RenderPlan` output — named roots, an abstract node tree, and named slots resolved to child component references or static content — containing no DOM, JSX, or renderer types.
- Add an explanation API that reports which template was selected for an instance and why, plus the resolved roots and slots, without renderer dependencies.
- Keep DOM rendering, real renderers, reactive primitives, layout, and dynamic hot template replacement **out of scope**; they remain deferred in the backlog.

## Capabilities

### New Capabilities

- `template-render-plans`: TemplateClass definitions, runtime-owned template registration and bound-class resolution, normalized renderer-neutral render plans with named roots and slots, and explanation APIs — all framework-independent.

### Modified Capabilities

None. Templates consume the existing component ownership, registration, and reference contracts without changing their externally observable requirements.

## Impact

- Extends the public `@velkren/core` API with TemplateClass, the template domain, render-plan and render-node contracts, explanation output, and template-domain errors.
- Reuses the internal typed-registration and ownership kernels and the component domain's instance/reference contracts while keeping generic registries and factory kernels out of the public export map.
- Adds no renderer primitive, DOM type, layout API, or browser integration; render plans are pure data.
