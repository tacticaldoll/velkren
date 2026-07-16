## ADDED Requirements

### Requirement: Minimal validation components

The validation package SHALL define minimal Panel, TextField, Button, and Dialog ComponentClasses with registered templates, and a Stack layout contract, composed only from `@velkren/core` and `@velkren/solid-adapter` public contracts. These are scenario fixtures and MUST NOT be exposed as a reusable public UI API.

#### Scenario: Components compose from public contracts

- **WHEN** the validation components and Stack layout are defined and registered in a runtime
- **THEN** each is created, templated, and laid out using only the public core and adapter contracts, with no access to generic kernels

### Requirement: Two isolated editors coexist

Two editor instances — each a Panel containing a TextField and a Button — SHALL coexist with distinct identities, references, and scopes. Resolving a reference or scope entry in one editor MUST NOT reach the other, and no identity or reference collision MUST occur.

#### Scenario: Editors do not collide

- **WHEN** two editors are created and projected together
- **THEN** each has distinct instance identities and scoped references, and neither editor's scope resolves the other's entries

#### Scenario: Interaction stays isolated

- **WHEN** an interaction drives a semantic event in the first editor
- **THEN** only the first editor's listeners react and the second editor is unaffected

### Requirement: Template change preserves business events

Replacing an editor's template MUST preserve its business semantic-event wiring. After re-templating, the editor's Button MUST still emit its business semantic event through the runtime's event contracts, and the new template MUST render through the adapter.

#### Scenario: Re-template keeps the business event

- **WHEN** an editor's template is replaced and its Button is then activated
- **THEN** the runtime observes the same business semantic event as before the replacement, and the surface reflects the new template

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
