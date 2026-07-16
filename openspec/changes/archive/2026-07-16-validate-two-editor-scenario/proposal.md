## Why

Every runtime domain — ownership, registration, events, listeners, plugins, components, templates, projection, layout, and a first SolidJS renderer — is implemented and unit-tested in isolation. Nothing yet proves they compose into a real multi-instance screen. A two-editor validation is that proof: it exercises identity isolation, references and scopes, semantic events, templates, layout, real rendering, and scoped disposal together, and would surface any integration gap the per-domain tests miss.

## What Changes

- Add a validation package `@velkren/two-editor-validation` that composes `@velkren/core` and `@velkren/solid-adapter`; it defines minimal validation components (Panel, TextField, Button, Dialog) as ComponentClasses with templates, and a Stack layout contract — fixtures for the scenario, not a reusable UI library.
- Assemble a two-editor application: two independent editor instances (each a Panel containing a TextField and a Button), each with its own scope and references, projected through the SolidJS adapter into a DOM surface.
- Prove **isolation**: the two editors coexist without identity, reference, or scope collisions, and interacting with one never affects the other.
- Prove **template resilience**: replacing an editor's template preserves its business semantic-event wiring — the Button still emits its business event after re-templating.
- Prove **scoped disposal**: destroying one editor releases only its owned component instances, root projections, layout bindings, and listeners, leaving the other editor fully functional.
- Keep advanced components, a reusable design system, real platform integration, routing, and persistence **out of scope**; this is a validation scenario, the final backlog item.

## Capabilities

### New Capabilities

- `two-editor-validation`: minimal validation components and a two-editor application proving end-to-end isolation, binding, semantic events, templates, layout, rendering, and scoped disposal compose correctly.

### Modified Capabilities

None. The scenario composes existing contracts without changing any domain's externally observable requirements.

## Impact

- Adds a validation package `packages/two-editor-validation` depending on `@velkren/core` and `@velkren/solid-adapter`, with a browser-like test environment; it ships no public runtime API.
- Adds no change to core or the adapter; if the scenario reveals a defect, that fix is a separate change against the responsible domain.
- Serves as the executable end-to-end acceptance for the dependency-ordered backlog.
