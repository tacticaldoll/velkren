# Semantic Events

## Purpose

Define runtime-isolated semantic event classes, strict immutable payloads, managed event lifecycles, deterministic dispatch, and safe tracing without exposing generic kernels or browser behavior.

## Requirements

### Requirement: Immutable registered EventClass definitions

The system SHALL expose EventClass definitions with framework-derived canonical IDs and immutable closed top-level payload schemas. Each schema SHALL declare every allowed field, whether it is required, and its validator. EventClass registration and event-specific namespace loading MUST remain runtime-owned and kind-safe while generic registration and loader kernels remain unavailable through the public export map.

#### Scenario: Define and register EventClass

- **WHEN** a caller defines EventClass `editor.saved` and registers it with an event-domain runtime
- **THEN** the class has canonical ID `event/editor.saved`, immutable schema identity, and an exclusively runtime-owned registration

#### Scenario: Domain registration handle

- **WHEN** EventClass registration, resolution, or loading succeeds
- **THEN** the public event API returns an owner-validated EventClassRegistration rather than a generic registration handle

#### Scenario: Load missing EventClass

- **WHEN** dispatch requests a missing EventClass with a matching event namespace loader
- **THEN** the event-domain facade uses deterministic typed namespace loading and dispatches only after atomic EventClass registration

#### Scenario: Generic kernels remain internal

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** EventClass and event-domain APIs are available without generic registry, factory, or loader APIs

#### Scenario: One event domain per runtime

- **WHEN** a caller attempts to create a second event-domain facade for the same Runtime
- **THEN** creation fails explicitly without replacing registries, loaders, factory, identity sequence, or trace sink

### Requirement: Strict closed-schema JSON payloads

Event creation MUST accept only non-proxy plain data objects whose own string keys exactly satisfy the EventClass schema. Callers MUST NOT provide Proxy objects because ECMAScript provides no portable side-effect-free proxy detection. The system MUST reject unknown fields, missing required fields, accessor properties, symbol keys, sparse arrays, cycles, observably non-plain objects, `undefined`, functions, symbols, bigint values, and non-finite numbers before publishing an EventInstance, and MUST NOT intentionally invoke ordinary accessors or `toJSON` methods.

#### Scenario: Valid payload

- **WHEN** every required field exists, every present field passes its validator, and all nested values are strict JSON data
- **THEN** event creation succeeds with a framework-owned snapshot

#### Scenario: Unknown or missing field

- **WHEN** a payload contains an undeclared field or omits a required field
- **THEN** event creation fails explicitly without publishing an EventInstance

#### Scenario: Invalid JSON data or validator failure

- **WHEN** payload traversal finds unsupported data, a cycle, or a declared field whose validator rejects or throws
- **THEN** event creation reports one payload validation error identifying the EventClass and field or data path

#### Scenario: Validator returns non-boolean

- **WHEN** a field validator returns a promise or any value other than boolean
- **THEN** event creation rejects the validator contract explicitly

### Requirement: Immutable detached event snapshots

Before an EventInstance becomes observable, the system MUST deeply copy the validated payload into framework-owned JSON data, serialize it deterministically in schema field order, and deeply freeze the snapshot. Later mutation of caller input MUST NOT change the event snapshot or trace data.

#### Scenario: Caller mutates input

- **WHEN** caller-owned nested input is changed after event creation
- **THEN** the active EventInstance snapshot and later trace records retain the original values

#### Scenario: Caller mutates snapshot

- **WHEN** a caller attempts to change any nested snapshot value
- **THEN** the immutable snapshot remains unchanged

### Requirement: Managed EventInstance lifecycle

Every EventInstance SHALL have a runtime-qualified instance ID, EventClass identity, opaque runtime ownership, observable managed status, and framework-owned event phase. Snapshot and optional raw source access MUST be active-only. Release MUST be idempotent and MUST clear snapshot text, snapshot object, raw source, and other live event references while retaining only the standard diagnostic tombstone.

#### Scenario: Create active EventInstance

- **WHEN** EventFactory creates an event from an active same-runtime EventClass registration
- **THEN** identity, ownership, lifecycle, phase, raw source, and detached snapshot are initialized before the instance is returned

#### Scenario: Release EventInstance

- **WHEN** an EventInstance is released
- **THEN** active-only access fails, live event references are cleared, and repeated release repeats no cleanup

#### Scenario: Foreign registration

- **WHEN** EventFactory receives an EventClass registration owned by another runtime
- **THEN** creation fails with an ownership error before payload validation or instance allocation

### Requirement: Deterministic programmatic dispatch

Programmatic dispatch SHALL resolve or load an EventClass, validate payload, create one EventInstance, advance framework-owned phases in order, emit trace records, and release the instance in a guaranteed finalization path. Lifecycle phases SHALL be observable but MUST NOT be cancellable. This change SHALL NOT invoke listeners, relayers, middleware, or native browser behavior.

Dispatch SHALL allocate a runtime-qualified diagnostic event ID before resolution so pre-instance failures can be traced. Successful EventFactory creation MUST adopt that ID for the EventInstance. Allocating a diagnostic ID MUST NOT publish a managed instance.

#### Scenario: Successful dispatch

- **WHEN** a valid programmatic event is dispatched
- **THEN** phases advance through created, completed, and released, the EventInstance is released exactly once, and dispatch returns an immutable trace transcript

#### Scenario: Dispatch failure

- **WHEN** resolution, loading, validation, tracing, or release fails
- **THEN** dispatch attempts required finalization and throws one event dispatch error preserving primary and cleanup or trace failures

#### Scenario: Failure before EventInstance creation

- **WHEN** resolution, loading, or payload validation fails before a managed EventInstance exists
- **THEN** dispatch emits a failed trace using its preallocated diagnostic event ID and performs no instance release

### Requirement: Safe immutable event traces

Each trace record MUST be immutable strict JSON data containing only framework-assigned event identity, EventClass identity, lifecycle phase, sequence, timestamps, outcome data, and a detached snapshot when that phase permits it. Trace records MUST NOT retain EventInstance, raw source, input payload, schema validators, registrations, errors, or other live references.

#### Scenario: Inspect successful transcript

- **WHEN** successful dispatch completes
- **THEN** its transcript explains event identity, class, ordered phases, timing, and payload snapshot without exposing live objects

#### Scenario: Inspect failed transcript

- **WHEN** dispatch fails
- **THEN** failure trace data contains JSON-safe error classification and message rather than an Error object reference

### Requirement: Optional ordered trace sink

An event-domain runtime SHALL accept an optional asynchronous trace sink and SHALL substitute a framework no-op sink when none is supplied. The sink SHALL receive each immutable record in phase order and SHALL have no cancellation authority. Sink failure MUST be reported explicitly while event finalization still runs.

#### Scenario: No trace sink supplied

- **WHEN** dispatch runs without a caller-provided sink
- **THEN** the framework no-op sink preserves identical event lifecycle behavior

#### Scenario: Asynchronous sink

- **WHEN** a trace sink returns a promise
- **THEN** dispatch awaits it before emitting the next phase record

#### Scenario: Trace sink fails

- **WHEN** the trace sink throws or rejects
- **THEN** dispatch records the diagnostic failure, releases the EventInstance, and reports the sink failure without silently swallowing it
