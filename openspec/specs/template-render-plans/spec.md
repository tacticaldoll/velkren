# Template Render Plans

## Purpose

Define runtime-isolated template definitions bound to component classes, deterministic template resolution, normalized renderer-neutral render plans with named roots and slots, and explanation APIs, composed onto the component runtime and shared kernel without renderer, DOM, or reactive dependencies.

## Requirements

### Requirement: Immutable registered TemplateClass definitions

The system SHALL expose helper-proven immutable `TemplateClass` definitions with framework-derived canonical `template/<slug>` IDs. Each definition SHALL declare exactly one bound target ComponentClass ID, at least one named root, and the named slots within its roots. Definitions SHALL be reusable across runtimes while registrations remain runtime-owned, and generic registration and factory kernels MUST remain unavailable through the public export map.

#### Scenario: Define and register TemplateClass

- **WHEN** a caller defines TemplateClass `editor.panel.default` bound to ComponentClass `component/editor.panel` and registers it with a template domain
- **THEN** the class has canonical ID `template/editor.panel.default`, immutable identity, and an exclusively runtime-owned registration

#### Scenario: Reject forged template definition

- **WHEN** registration receives a frozen structural imitation or a mutable TemplateClass without framework provenance
- **THEN** registration fails before publishing any template registration

#### Scenario: Reject a template without a named root

- **WHEN** a caller defines a TemplateClass that declares no root or a root with a blank name
- **THEN** definition creation fails with a template definition error

### Requirement: Bound-class registration uniqueness

A template domain MUST allow at most one active template registration per bound ComponentClass ID. Duplicate active binding and a binding whose target ComponentClass ID is malformed MUST fail explicitly and MUST NOT replace an existing registration. Replacing an active template MUST use an explicit replacement operation.

#### Scenario: Reject duplicate binding

- **WHEN** a second template is registered for a ComponentClass that already has an active bound template
- **THEN** registration fails and the original bound template remains active

#### Scenario: Explicit replacement

- **WHEN** a caller explicitly replaces the active template bound to a ComponentClass with a valid template for the same bound class
- **THEN** the new template becomes active with a greater revision and the previous revision remains identifiable for diagnostics

### Requirement: Deterministic template resolution

Resolution SHALL select the single active template registration bound to a component instance's ComponentClass. Selection MUST be deterministic, MUST occur against the instance's own runtime, and MUST fail explicitly when no template is bound. A foreign-runtime instance MUST be rejected before resolution.

#### Scenario: Resolve the bound template

- **WHEN** a component instance of `component/editor.panel` resolves a plan and one active template is bound to that class
- **THEN** resolution selects that template deterministically

#### Scenario: No bound template

- **WHEN** a component instance whose ComponentClass has no active bound template resolves a plan
- **THEN** resolution fails explicitly without producing a render plan

#### Scenario: Reject foreign instance

- **WHEN** resolution receives a component instance owned by another runtime
- **THEN** it fails with an ownership error before selecting a template

### Requirement: Normalized renderer-neutral render plans

Resolution SHALL produce a deeply frozen `RenderPlan` containing the selected template identity, the resolved component instance identity, and one or more named roots. Each root SHALL expose an abstract render-node tree whose nodes carry a renderer-neutral node kind, strict-JSON attributes, ordered children, and named slots. A RenderPlan MUST NOT contain DOM nodes, JSX elements, renderer objects, reactive primitives, or live mutable collections.

#### Scenario: Resolve a multi-root plan

- **WHEN** a component instance resolves a template that declares two named roots
- **THEN** the render plan exposes both named roots as an immutable abstract node tree without renderer or DOM types

#### Scenario: Immutable plan

- **WHEN** a caller attempts to mutate a resolved render plan, a node, or its attributes
- **THEN** the plan remains unchanged

#### Scenario: Strict-JSON attributes only

- **WHEN** a template node declares an attribute value that is not strict JSON data
- **THEN** plan resolution fails explicitly identifying the offending node and attribute

### Requirement: Named slot resolution

A render plan SHALL resolve each declared named slot to either an owner-validated child component reference or renderer-neutral static content. Every declared slot MUST resolve exactly once; an unfilled required slot, a duplicate slot fill, and an unknown slot name MUST fail explicitly. A resolved slot MUST NOT expose a live component instance directly.

#### Scenario: Resolve a filled slot

- **WHEN** a template declares a named slot and resolution supplies an owner-validated child reference for it
- **THEN** the plan exposes that slot filled with the reference and no live instance

#### Scenario: Reject an unknown or duplicate slot

- **WHEN** resolution supplies content for a slot the template does not declare, or fills the same slot twice
- **THEN** resolution fails explicitly without producing a partial plan

#### Scenario: Reject an unfilled required slot

- **WHEN** a template declares a required slot that resolution does not fill
- **THEN** resolution fails explicitly identifying the missing slot

### Requirement: Render-plan explanation

The template domain SHALL expose an explanation API that reports, for a component instance, which template was selected, the bound ComponentClass that caused the selection, and the resolved root and slot names. Explanation output MUST be immutable strict-JSON data and MUST NOT retain live component instances, references, registrations, or renderer objects.

#### Scenario: Explain a selected template

- **WHEN** a caller requests an explanation for a component instance with a bound template
- **THEN** the explanation reports the selected template ID, the bound ComponentClass ID, and the resolved root and slot names as immutable data

#### Scenario: Explain an unresolved instance

- **WHEN** a caller requests an explanation for a component instance with no bound template
- **THEN** the explanation reports that no template is bound without throwing

### Requirement: Public template-domain boundary

The public core entry SHALL expose TemplateClass, the template domain, render-plan and render-node contracts, explanation output, and template-domain error contracts without exposing generic registries, factory kernels, resolution internals, or deferred renderer, DOM, layout, or hot-replacement APIs.

#### Scenario: Import template APIs

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** template, render-plan, and explanation contracts are available while their generic kernels and deferred domains remain unavailable

### Requirement: Framework-independent template core

TemplateClass definitions, registration, resolution, render plans, slots, and explanation contracts MUST remain usable in Node.js without DOM, JSX, CSS, renderer, browser Event, or reactive-library dependencies.

#### Scenario: Execute template core in Node.js

- **WHEN** the template-domain test suite runs in a Node.js environment
- **THEN** definition, registration, resolution, multi-root plans, slot resolution, explanation, ownership rejection, and immutability all execute without browser globals
