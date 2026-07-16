## ADDED Requirements

### Requirement: Immutable registered ComponentClass definitions

The system SHALL expose helper-proven immutable `ComponentClass` definitions with framework-derived canonical `component/<slug>` IDs and an immutable creation contract. Definitions SHALL be reusable across runtimes while registrations remain runtime-owned and protected by the component-domain facade. Generic registration and factory kernels MUST remain unavailable through the public export map.

#### Scenario: Define and register ComponentClass

- **WHEN** a caller defines ComponentClass `editor.panel` and registers it with a component-domain runtime
- **THEN** the class has canonical ID `component/editor.panel`, immutable identity, and an exclusively runtime-owned registration

#### Scenario: Reuse definition across runtimes

- **WHEN** the same immutable ComponentClass is registered in two runtimes
- **THEN** each runtime creates an independent owner-validated registration with its own lifecycle while the definition stays portable

#### Scenario: Reject forged component definition

- **WHEN** registration receives a frozen structural imitation or a mutable ComponentClass without framework provenance
- **THEN** registration fails before publishing any component registration

#### Scenario: Generic kernels remain internal

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** ComponentClass and component-domain APIs are available without generic registry, factory, or loader APIs

### Requirement: Central managed component-instance creation

Runtime-managed component instances MUST be created by the component-domain `ComponentFactory` from an active same-runtime ComponentClass registration. The factory SHALL assign opaque runtime ownership, a runtime-qualified instance ID, and an active managed lifecycle. Callers MUST NOT create a valid component instance that bypasses registration, ownership assignment, identity allocation, or lifecycle initialization.

#### Scenario: Create from active registration

- **WHEN** a caller asks the factory to create an instance from an active same-runtime registration
- **THEN** the factory assigns runtime ownership, a qualified instance ID, and an active managed lifecycle before returning the instance

#### Scenario: Create from missing registration

- **WHEN** a caller asks the factory to create an instance for an unregistered component class ID
- **THEN** creation fails without allocating a managed instance

#### Scenario: Reject foreign registration

- **WHEN** the factory receives a ComponentClass registration owned by another runtime
- **THEN** creation fails with an ownership error before invoking the definition's creation behavior

#### Scenario: Creation behavior fails

- **WHEN** definition-specific creation behavior throws after the factory has initialized temporary managed resources
- **THEN** the factory attempts reverse-order cleanup, does not publish or return an active instance, and throws a creation error preserving the original cause and any cleanup failures

### Requirement: Logical instance trees

Component instances SHALL compose into a logical tree through owner-validated attachment. Each instance SHALL have at most one parent, and attachment MUST reject a foreign-runtime instance, a cycle, and reparenting of an already-attached instance before mutating tree state. Tree structure SHALL be inspectable without exposing mutable internals.

#### Scenario: Attach child instance

- **WHEN** a parent instance attaches an owned child
- **THEN** the child becomes an inspectable member of the parent's ordered children and reports that parent

#### Scenario: Reject cross-runtime attachment

- **WHEN** attachment receives a child owned by another runtime
- **THEN** it fails with an ownership error before changing either instance's tree state

#### Scenario: Reject cyclic or reparented attachment

- **WHEN** attachment would introduce a cycle or move an already-attached instance to a new parent
- **THEN** it fails explicitly and the existing tree is unchanged

### Requirement: Deterministic tree-ordered release cascade

Releasing a component instance SHALL release its attached descendants first in deterministic reverse-attachment order, then release the instance itself. Release MUST be idempotent, MUST detach the instance from its parent, MUST revoke references the instance issued so a released instance retains no reference to its value or other managed objects, and MUST clean owned resources in reverse registration order without silently swallowing failures.

#### Scenario: Release cascades to descendants

- **WHEN** a parent with attached descendants is released
- **THEN** descendants release before the parent in deterministic reverse-attachment order and each becomes a diagnostic tombstone

#### Scenario: Release detaches from parent

- **WHEN** an attached child instance is released directly
- **THEN** it is removed from its parent's children and the parent remains active

#### Scenario: Cascade cleanup failure

- **WHEN** one or more descendant releases fail during a cascade
- **THEN** every remaining descendant and the root still receive a release attempt, the affected instances become released, and one aggregate release error preserves every failure

#### Scenario: Repeated release

- **WHEN** release is requested more than once for the same instance or its subtree
- **THEN** cleanup side effects occur only once and later requests observe the released state

### Requirement: Explicit scoped visibility

The system SHALL define `Scope` as an explicit authority boundary that controls which references and event endpoints are resolvable for a component subtree. A scope SHALL resolve only entries explicitly provided in it or an ancestor scope, MUST NOT fall back to selector queries or global lookup, and MUST fail explicitly when a requested name is not visible. A nested scope SHALL extend its parent without mutating it.

#### Scenario: Resolve within scope

- **WHEN** a component resolves a reference name explicitly provided in its scope or an ancestor scope
- **THEN** resolution returns the owner-validated reference for that name

#### Scenario: Reject out-of-scope resolution

- **WHEN** a component resolves a name that is not provided in its scope chain
- **THEN** resolution fails explicitly without consulting selectors, the DOM, or any global registry

#### Scenario: Nested scope extension

- **WHEN** a child scope provides a name and defers others to its parent scope
- **THEN** the child observes its own entry plus inherited ancestor entries while the parent scope remains unchanged

### Requirement: Owner-validated references

The system SHALL expose `Reference` as an owner-validated, frozen opaque capability for interacting with a component instance through its public contract. Possession of a reference MUST NOT expose private runtime capabilities. Strings, DOM attributes, selectors, and structural imitations MUST NOT grant a reference, and a foreign-runtime reference MUST be rejected with an ownership error when it enters a domain operation. Access through a reference to a released target MUST fail as active-only. Dynamic capability grant, delegation, and standalone revocation authority are out of scope.

#### Scenario: Use valid reference

- **WHEN** a caller interacts with a live same-runtime component instance through its reference
- **THEN** the permitted public operation succeeds without exposing private runtime capabilities

#### Scenario: Reject imitation or foreign reference

- **WHEN** a reference operation receives a structural imitation or a reference owned by another runtime
- **THEN** it fails with an ownership error before performing the operation

#### Scenario: Reference to released target

- **WHEN** a caller uses a reference whose target instance or endpoint has been released
- **THEN** the operation fails with a lifecycle error and the reference exposes only diagnostic identity

### Requirement: Public component-domain boundary

The public core entry SHALL expose ComponentClass, component creation, component instance handles, Scope, Reference, tree operations, and component-domain error contracts without exposing generic registries, factory kernels, scope storage, tree internals, phase mutation, or deferred capability-authority, template, layout, or renderer APIs.

#### Scenario: Import component APIs

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** component, scope, and reference contracts are available while their generic kernels and deferred domains remain unavailable

### Requirement: Framework-independent component core

Component definitions, creation, instance trees, scopes, references, and lifecycle contracts MUST remain usable in Node.js without DOM, JSX, CSS, renderer, browser Event, or reactive-library dependencies.

#### Scenario: Execute component core in Node.js

- **WHEN** the component-domain test suite runs in a Node.js environment
- **THEN** creation, tree cascade, scoped resolution, reference validation, ownership rejection, and cleanup complete without browser globals
