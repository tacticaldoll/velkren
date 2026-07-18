# Two-Editor Validation

## Purpose

Define the end-to-end validation scenario: minimal Panel, TextField, Button, and Dialog components with templates and a Stack layout, assembled into two isolated editors projected through the SolidJS adapter, proving identity isolation, template resilience, and scoped disposal compose correctly across every runtime domain.

## Requirements

### Requirement: Minimal validation components

The validation package SHALL define minimal Panel, TextField, Button, and Dialog ComponentClasses with registered templates, and a Stack layout contract, composed only from `@velkren/core` public contracts with the renderer injected through the shared test-drive surface. These are scenario fixtures and MUST NOT be exposed as a reusable public UI API.

#### Scenario: Components compose from public contracts

- **WHEN** the validation components and Stack layout are defined and registered in a runtime
- **THEN** each is created, templated, and laid out using only the public core contracts and the injected renderer surface, with no access to generic kernels and no adapter-specific import in the composition

### Requirement: Two isolated editors coexist

Two editor instances — each a Panel containing a TextField and a Button — SHALL coexist with distinct identities, references, and scopes. Resolving a reference or scope entry in one editor MUST NOT reach the other, and no identity or reference collision MUST occur.

#### Scenario: Editors do not collide

- **WHEN** two editors are created and projected together
- **THEN** each has distinct instance identities and scoped references, and neither editor's scope resolves the other's entries

#### Scenario: Interaction stays isolated

- **WHEN** an interaction drives a semantic event in the first editor
- **THEN** only the first editor's listeners react and the second editor is unaffected

### Requirement: Template change preserves business events

Replacing an editor's template MUST preserve its business semantic-event wiring through the interaction-binding contract. Re-templating commits a new plan to the same root, so the root's interaction binding MUST remain intact and the Button MUST still emit its business semantic event through the runtime's event contracts, while the new template renders through the adapter.

#### Scenario: Re-template keeps the business event

- **WHEN** an editor's template is replaced by committing a new plan to its root, and its Button is then activated
- **THEN** the runtime observes the same business semantic event as before the replacement through the unchanged binding, and the surface reflects the new template

### Requirement: Scoped disposal cancels only owned work

Destroying one editor MUST release only its owned component instances, root projections, layout bindings, and listeners. The other editor MUST remain active and fully functional, and no listener, reactive effect, or projected root belonging to the surviving editor MUST be affected.

#### Scenario: Destroy one editor, keep the other

- **WHEN** the first editor is destroyed
- **THEN** its instances, roots, layout bindings, and listeners are released while the second editor still renders, reacts, and emits events

#### Scenario: No leaked work after disposal

- **WHEN** an editor is destroyed
- **THEN** none of its reactive effects or DOM listeners remain and its projected roots are removed from the surface

### Requirement: End-to-end scenario in a browser-like environment

The scenario SHALL run in a package-scoped browser-like environment, mounting through the SolidJS adapter, driving reactions and semantic events, and disposing, without altering the core package's Node-only test environment.

#### Scenario: Full lifecycle executes end to end

- **WHEN** the two-editor scenario mounts, reacts, emits business events, re-templates, and disposes one editor
- **THEN** every step completes against a DOM surface with the documented isolation, template-resilience, and scoped-disposal guarantees observed

### Requirement: Interaction routed through the neutral port

The validation SHALL drive editor interactions through the renderer port and the interaction-binding contract, not through application-level DOM selection or a native listener attached to a queried element. Each editor's Button interaction MUST be bound to its business EventClass so that a captured interaction dispatches the semantic event via the runtime's own contracts, and the validation MUST NOT use `data-velkren-root` selectors or `addEventListener` for coordination.

#### Scenario: Business event flows through binding

- **WHEN** an editor's Button is activated and the adapter captures the interaction
- **THEN** the runtime dispatches the editor's business semantic event through the interaction-binding contract, and the validation performs no DOM query or native listener attachment to observe it

### Requirement: Renderer-agnostic composition and shared test-drive surface

The validation composition SHALL be renderer-agnostic: `createEditorApp(renderer)` SHALL take an injected renderer and compose the runtime, components, templates, events, layout, and interaction binding using only `@velkren/core` public contracts, with no dependency on any specific renderer adapter in its source. The package SHALL define a DOM-neutral `RendererTestHarness` — the `RendererPort` plus `simulateInteraction(identity, type)` and `elementForIdentity(identity)` returning an opaque value — that any adapter satisfies structurally without importing it, and the composition SHALL drive and inspect the renderer only through that surface (checking projection presence by identity, not by a DOM type). The same composition SHALL be mountable on more than one adapter with only the injected renderer differing.

#### Scenario: The same composition runs on an injected renderer

- **WHEN** `createEditorApp` is given a renderer that satisfies the shared test-drive surface
- **THEN** it composes and drives the two-editor scenario using only that surface and `@velkren/core` contracts, with no adapter-specific import in the composition source

#### Scenario: Composition source depends on no renderer adapter

- **WHEN** the fixture package's source is built
- **THEN** it imports only `@velkren/core` (a renderer adapter is a test-only dependency), so the composition is renderer-agnostic
