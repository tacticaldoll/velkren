## Why

Velkren has runtime ownership, typed registration, events, listeners, and transactional plugins, but nothing that instantiates application structure. Components are the first domain that composes managed instances into logical trees and coordinates them through explicit references and scopes rather than selectors or global lookup. This is the dependency that templates, projection, and adapters build on, so it must fix ownership, identity, tree lifecycle, and scoped visibility before any rendering exists.

## What Changes

- Add immutable helper-proven `ComponentClass` definitions with canonical `component/<slug>` IDs, reusable across runtimes while registrations stay runtime-owned.
- Add a `ComponentFactory` that creates runtime-owned managed component instances from an active same-runtime registration, assigning ownership, a qualified instance ID, and an active managed lifecycle.
- Add logical instance trees: owner-validated parent/child attachment, deterministic tree-ordered release cascade, and rejection of cross-runtime or cyclic attachment.
- Add `Scope` as an explicit authority boundary that controls which references and event endpoints are visible within a subtree, replacing selector-based discovery.
- Add `Reference` as an owner-validated capability to interact with a component instance or endpoint; possession never exposes private runtime capabilities, and strings, DOM attributes, or selectors never grant it.
- Keep capability grant/revoke/delegate authority, renderers, DOM, templates, render plans, layout, and reactive primitives **out of scope** — capabilities move to a separate follow-up change; the rest remain deferred in the backlog.

## Capabilities

### New Capabilities

- `component-runtime`: ComponentClass definitions, ComponentFactory, managed component instances, logical instance trees, scoped reference/endpoint visibility, and owner-validated references — all framework-independent.

### Modified Capabilities

None. Components compose the existing ownership, registration, event, and listener contracts without changing their externally observable requirements.

## Impact

- Extends the public `@velkren/core` API with ComponentClass, component factory, instance handles, scope and reference contracts, tree operations, and component-domain errors.
- Reuses the internal typed-registration, ownership, and managed-lifecycle kernels while keeping generic registries and factory kernels out of the public export map.
- Adds no renderer primitive, DOM type, template/render-plan API, layout API, capability-authority API, or browser integration.
- Re-scopes the backlog: `add-component-runtime` drops capabilities, and a new `add-capability-authority` item is sequenced after it.
