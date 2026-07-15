# Typed Registration Specification

## Purpose

Define immutable typed class definitions, runtime-owned registration, protected revision changes, and the central managed-instance factory boundary.

## Requirements

### Requirement: Immutable typed definitions

The internal registration kernel SHALL create class definitions through a kind-specific definition helper. A definition SHALL have an immutable local slug, and the helper SHALL automatically prepend the definition kind to produce a canonical class ID. The initial core package MUST NOT export the generic helper or a domain-specific registration API.

#### Scenario: Canonical test class ID

- **WHEN** internal test kind `alpha` creates a definition with local slug `sample.item`
- **THEN** its canonical class ID is `alpha/sample.item`

#### Scenario: Definition ID mutation

- **WHEN** a caller attempts to change a definition's local slug or canonical class ID after creation
- **THEN** the original identity remains unchanged

#### Scenario: Invalid local slug

- **WHEN** a caller supplies an empty slug, an empty namespace segment, a runtime separator, or a handwritten kind prefix
- **THEN** definition creation fails with an identity validation error

### Requirement: Runtime-owned typed registrations

Each runtime SHALL own separate typed registries. A registration SHALL combine the runtime identifier, definition kind, and local slug into a qualified registration ID, while the underlying definition remains reusable across runtimes.

#### Scenario: Register definition

- **WHEN** runtime `admin` internally registers test-kind definition `alpha/sample.item`
- **THEN** the registration has qualified ID `admin::alpha/sample.item` and belongs exclusively to the `admin` runtime

#### Scenario: Reuse definition across runtimes

- **WHEN** the same immutable definition is registered in two runtimes
- **THEN** each runtime creates an independent registration with its own owner and lifecycle

#### Scenario: Typed registry isolation

- **WHEN** equal local slugs are registered in internal test kinds `alpha` and `beta`
- **THEN** the registrations coexist with distinct canonical and qualified IDs

#### Scenario: Initial package exports

- **WHEN** a consumer imports the initial core package through its public export map
- **THEN** generic registration helpers, internal test kinds, and domain registration APIs are not available

### Requirement: Registration uniqueness

A typed registry MUST allow at most one active registration for a canonical class ID. Duplicate registration and definition-kind mismatch MUST fail explicitly and MUST NOT replace an existing registration.

#### Scenario: Duplicate active registration

- **WHEN** a runtime attempts to register a second active definition with the same kind and local slug
- **THEN** registration fails and the original registration remains active

#### Scenario: Definition kind mismatch

- **WHEN** a definition is submitted to a registry for another class kind
- **THEN** registration fails before the registry changes

### Requirement: Explicit registration replacement

Replacing an active registration MUST use an explicit replacement operation. A successful replacement SHALL create a new runtime-assigned registration revision without modifying the immutable definition ID.

#### Scenario: Replace registration

- **WHEN** a runtime explicitly replaces an active registration with a valid definition of the same kind and local slug
- **THEN** the new registration becomes active with a greater revision and the previous revision remains identifiable for diagnostics

#### Scenario: Replace registration with live dependents

- **WHEN** a runtime attempts to replace an active registration that has live dependent instances
- **THEN** replacement fails with a dependency error and the existing registration remains active and unchanged

### Requirement: Central managed-instance creation

Runtime-managed instances MUST be created by a kind-specific runtime factory from an active typed registration. Callers MUST NOT be able to create a valid managed instance that bypasses registration, ownership assignment, identity allocation, or lifecycle initialization.

#### Scenario: Create from active registration

- **WHEN** a caller asks the matching factory to create an instance from an active registration
- **THEN** the factory assigns runtime ownership, a qualified instance ID, and an active managed lifecycle

#### Scenario: Create from missing registration

- **WHEN** a caller asks a factory to create an instance for an unregistered class ID
- **THEN** creation fails without allocating a managed instance

#### Scenario: Create with another runtime's registration

- **WHEN** a factory receives a registration owned by another runtime
- **THEN** creation fails with an ownership error before invoking the definition's creation behavior

#### Scenario: Definition creation behavior fails

- **WHEN** definition-specific creation behavior throws after the factory has initialized temporary managed resources
- **THEN** the factory attempts reverse-order cleanup, does not publish or return an active managed instance, and throws a creation error that preserves the original cause and any cleanup failures

### Requirement: Registration lifecycle

Unregistering a class SHALL stop new factory creation through that registration and SHALL release the registration's runtime-owned resources. Registration removal MUST NOT mutate the reusable class definition.

#### Scenario: Unregister definition

- **WHEN** an active registration with no live dependents is unregistered
- **THEN** subsequent resolution and creation requests do not observe that registration while the definition remains reusable

#### Scenario: Unregister definition with live dependents

- **WHEN** a runtime attempts to unregister a registration that has live dependent instances
- **THEN** unregister fails with a dependency error and the registration and its dependents remain active and unchanged
