## MODIFIED Requirements

### Requirement: Deterministic programmatic dispatch

Programmatic dispatch SHALL resolve or load an EventClass, validate payload, create one EventInstance, advance framework-owned phases in order, emit trace records, invoke the immutable reaction snapshot of the selected EventEndpoint channel, and release the instance in a guaranteed finalization path. Listener and middleware reaction SHALL be awaited serially and lifecycle phases SHALL remain observable but MUST NOT be cancellable. This change SHALL NOT invoke native browser behavior, DOM propagation, or default prevention.

Dispatch SHALL allocate a runtime-qualified diagnostic event ID before resolution so pre-instance failures can be traced. Successful EventFactory creation MUST adopt that ID for the EventInstance. Allocating a diagnostic ID MUST NOT publish a managed instance. Existing `EventRuntime.dispatch()` SHALL publish through the EventRuntime's default public endpoint; explicit endpoint publication SHALL select its own public or private channel.

#### Scenario: Successful dispatch without listeners

- **WHEN** a valid programmatic event is dispatched and no matching listener is active
- **THEN** phases advance through created, completed, and released, the EventInstance is released exactly once, and dispatch returns an immutable trace transcript

#### Scenario: Successful dispatch with listeners

- **WHEN** a selected endpoint channel has matching active listeners and every reaction completes successfully
- **THEN** created trace precedes deterministic listener reaction, completed trace follows reaction, and released trace follows guaranteed EventInstance release

#### Scenario: Dispatch failure

- **WHEN** resolution, loading, validation, listener reaction, tracing, or release fails
- **THEN** dispatch attempts required finalization and throws one event dispatch error preserving primary and cleanup or trace failures

#### Scenario: Failure before EventInstance creation

- **WHEN** resolution, loading, or payload validation fails before a managed EventInstance exists
- **THEN** dispatch emits a failed trace using its preallocated diagnostic event ID and performs no instance release or listener reaction

#### Scenario: Reaction short-circuit

- **WHEN** a listener or middleware returns the exact boolean false according to the managed-listener contract
- **THEN** later listeners do not run, dispatch still completes successfully, and EventInstance release remains guaranteed
