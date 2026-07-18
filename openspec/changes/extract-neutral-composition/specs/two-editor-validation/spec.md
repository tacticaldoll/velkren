## ADDED Requirements

### Requirement: Renderer-agnostic composition and shared test-drive surface

The validation composition SHALL be renderer-agnostic: `createEditorApp(renderer)` SHALL take an injected renderer and compose the runtime, components, templates, events, layout, and interaction binding using only `@velkren/core` public contracts, with no dependency on any specific renderer adapter in its source. The package SHALL define a DOM-neutral `RendererTestHarness` — the `RendererPort` plus `simulateInteraction(identity, type)` and `elementForIdentity(identity)` returning an opaque value — that any adapter satisfies structurally without importing it, and the composition SHALL drive and inspect the renderer only through that surface (checking projection presence by identity, not by a DOM type). The same composition SHALL be mountable on more than one adapter with only the injected renderer differing.

#### Scenario: The same composition runs on an injected renderer

- **WHEN** `createEditorApp` is given a renderer that satisfies the shared test-drive surface
- **THEN** it composes and drives the two-editor scenario using only that surface and `@velkren/core` contracts, with no adapter-specific import in the composition source

#### Scenario: Composition source depends on no renderer adapter

- **WHEN** the fixture package's source is built
- **THEN** it imports only `@velkren/core` (a renderer adapter is a test-only dependency), so the composition is renderer-agnostic

## MODIFIED Requirements

### Requirement: Minimal validation components

The validation package SHALL define minimal Panel, TextField, Button, and Dialog ComponentClasses with registered templates, and a Stack layout contract, composed only from `@velkren/core` public contracts with the renderer injected through the shared test-drive surface. These are scenario fixtures and MUST NOT be exposed as a reusable public UI API.

#### Scenario: Components compose from public contracts

- **WHEN** the validation components and Stack layout are defined and registered in a runtime
- **THEN** each is created, templated, and laid out using only the public core contracts and the injected renderer surface, with no access to generic kernels and no adapter-specific import in the composition
