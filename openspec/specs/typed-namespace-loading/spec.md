# Typed Namespace Loading Specification

## Purpose

Define internal runtime-owned namespace loaders, deterministic explicit asynchronous class loading, per-class deduplication, and atomic staged registration.

## Requirements

### Requirement: Runtime-owned typed namespace loaders

Each typed namespace loader SHALL belong to one runtime and one class kind, SHALL declare one validated local namespace, and SHALL have an immutable runtime-qualified loader identity. A typed loader registry MUST reject duplicate active ownership of the same kind and namespace without replacing the existing loader.

#### Scenario: Register namespace loader

- **WHEN** runtime `admin` registers an `alpha` loader for namespace `app.editor`
- **THEN** the loader registration has a stable identity qualified by runtime, kind, and namespace and belongs exclusively to that runtime

#### Scenario: Equal namespace in isolated runtimes

- **WHEN** two runtimes with equal readable IDs register the same kind and namespace
- **THEN** their loader registrations remain independently owned and usable only by their respective runtimes

#### Scenario: Duplicate namespace loader

- **WHEN** a runtime registers a second active loader for the same kind and namespace
- **THEN** registration fails explicitly and the original loader remains active

### Requirement: Deterministic deepest-namespace selection

When an explicitly requested canonical class is missing, the loader resolver SHALL select the active same-kind loader whose dot-segment namespace is the deepest ancestor of the requested local slug. Selection MUST occur once per load attempt, and failure after selection MUST NOT fall back to a shallower loader.

#### Scenario: Select deepest ancestor

- **WHEN** loaders own `app` and `app.editor` and class `alpha/app.editor.dialog` is requested
- **THEN** only the `app.editor` loader is invoked

#### Scenario: Use root namespace

- **WHEN** no named namespace matches and an active root loader exists for the requested kind
- **THEN** the root loader is selected

#### Scenario: No matching loader

- **WHEN** a missing class has no matching active loader
- **THEN** loading fails explicitly without changing class or loader registrations

#### Scenario: Requested class kind mismatch

- **WHEN** a resolver receives a canonical class ID for a different class kind
- **THEN** loading fails before loader selection and invokes no loader

#### Scenario: Selected loader fails

- **WHEN** the deepest matching loader throws or does not contribute the requested class
- **THEN** loading reports that selected-loader failure and does not invoke any shallower loader

### Requirement: Explicit asynchronous loading boundary

Namespace loading SHALL occur only through an explicit asynchronous load operation. Existing synchronous registration lookup MUST remain side-effect free, and an already active class registration SHALL be returned without invoking a loader.

#### Scenario: Synchronous lookup remains pure

- **WHEN** synchronous resolution is requested for a missing class
- **THEN** it reports no active registration and invokes no namespace loader

#### Scenario: Already registered class

- **WHEN** asynchronous loading is requested for an already active class registration
- **THEN** the existing registration is returned without invoking a loader

### Requirement: Per-class concurrent-load deduplication

Each loader resolver SHALL be permanently paired with one typed class registry and MUST share one in-flight operation for concurrent requests for the same missing canonical class through that resolver. Requests for different classes SHALL remain independent, and every completed or failed operation MUST leave the in-flight table so a later request can retry or observe a newly registered class.

#### Scenario: Concurrent requests for one class

- **WHEN** multiple callers request the same missing class before its selected loader completes
- **THEN** the loader runs once and every caller observes the same registration or the same failure

#### Scenario: Concurrent requests for different classes

- **WHEN** callers request two different missing classes concurrently
- **THEN** neither request is deduplicated against the other

#### Scenario: Retry after failure

- **WHEN** a class load fails and a later caller requests that class again
- **THEN** a new load attempt may run using the loader state active at retry time

### Requirement: Atomic staged registration

A selected loader SHALL return a finite staged contribution of immutable definitions. Before publishing any contribution, the system MUST validate ownership context, definition kind, loader namespace, duplicate contribution IDs, the presence of the requested class, and conflicts with active registrations. The entire contribution MUST publish atomically or leave the typed registry unchanged.

#### Scenario: Publish valid contribution

- **WHEN** the selected loader contributes the requested class and related same-kind definitions inside its namespace with no conflicts
- **THEN** every contributed registration becomes active as one successful load result

#### Scenario: Invalid staged contribution

- **WHEN** any contributed definition has the wrong kind, lies outside the selected namespace, duplicates another contribution, or conflicts with an active registration
- **THEN** no contributed registration is published and existing registrations remain unchanged

#### Scenario: Requested class omitted

- **WHEN** a loader completes without contributing the requested class
- **THEN** loading fails explicitly and publishes none of its other contributions

#### Scenario: Contribution limit exceeded

- **WHEN** a loader contribution exceeds the resolver's documented internal maximum
- **THEN** materialization fails explicitly and no contributed registration is published

### Requirement: Loader lifecycle and public boundary

Loader registrations SHALL use the managed lifecycle. Unregistering an idle loader SHALL stop future selection and release its resources; unregistering or replacing a loader with in-flight loads MUST fail without mutation. The initial core package MUST NOT expose generic loader registries, loader definitions, test kinds, or domain loading APIs through its public export map.

#### Scenario: Replace idle loader

- **WHEN** an active loader with no in-flight load is explicitly replaced by a valid loader definition for the same kind and namespace
- **THEN** the replacement becomes active with a greater runtime-assigned revision and the prior released revision remains identifiable for diagnostics

#### Scenario: Unregister idle loader

- **WHEN** an active loader has no in-flight load and is unregistered
- **THEN** future attempts cannot select it and the loader registration becomes released

#### Scenario: Protect in-flight loader

- **WHEN** replacement or unregister is requested while the loader is serving one or more loads
- **THEN** the lifecycle operation fails explicitly and the active loader and in-flight operations remain unchanged

#### Scenario: Initial package exports

- **WHEN** a consumer imports the initial core package through its public export map
- **THEN** namespace loader kernel and test-domain APIs are unavailable
