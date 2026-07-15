# Managed Listeners

## Purpose

Define runtime-isolated endpoint authority, managed listener subscriptions, deterministic middleware reaction, and safe semantic relays without browser or renderer coupling.

## Requirements

### Requirement: Managed EventEndpoint authority

The system SHALL create EventEndpoint instances as runtime-owned managed publication and subscription authorities with runtime-qualified identities and idempotent release. Public endpoint handles and private endpoint controllers MUST be separate frozen opaque capabilities. IDs, strings, structural imitations, and foreign-runtime handles MUST NOT grant endpoint authority.

#### Scenario: Create endpoint capabilities

- **WHEN** an EventRuntime creates an endpoint
- **THEN** it returns owner-validated public and private capabilities for one active managed endpoint without registering a global lookup

#### Scenario: Reject foreign endpoint

- **WHEN** a runtime operation receives an endpoint capability owned by another Runtime
- **THEN** it fails with an ownership error before payload traversal, listener mutation, or callback execution

#### Scenario: Release endpoint

- **WHEN** a private controller releases its endpoint
- **THEN** new publication and subscription fail, owned listeners release in reverse installation order, an already executing callback may finish without release waiting on it, later snapshotted listeners are skipped, and repeated release repeats no cleanup

### Requirement: Explicit public and private channels

The system SHALL define a closed EventChannel enum containing public and private. Public endpoint capability possession SHALL authorize public publication and public subscription. Private publication and private subscription MUST require possession of the paired private controller. Publication on one channel MUST NOT implicitly reach the other channel.

#### Scenario: Public publication

- **WHEN** a caller publishes through a public endpoint capability
- **THEN** only active public listeners installed on that endpoint are eligible to react

#### Scenario: Private publication

- **WHEN** a controller publishes through its private authority
- **THEN** only active private listeners installed on that endpoint are eligible to react

#### Scenario: Structural imitation

- **WHEN** a caller supplies a frozen object with copied endpoint fields but no framework provenance
- **THEN** private or public endpoint operations reject it explicitly

### Requirement: Immutable ListenerClass definitions

The system SHALL expose helper-proven immutable ListenerClass definitions with canonical `listener/<slug>` IDs. Each ListenerClass SHALL declare exactly one helper-proven EventClass, one receiver callback, and an immutable ordered middleware list. Definitions SHALL be reusable across runtimes while registrations remain runtime-owned and protected by the listener-domain facade.

#### Scenario: Define and register listener

- **WHEN** a caller defines and registers a ListenerClass for one EventClass
- **THEN** the definition remains portable and immutable while each runtime receives an independent owner-validated registration

#### Scenario: Reject forged listener definition

- **WHEN** registration receives a frozen structural imitation or a ListenerClass with a forged EventClass or middleware descriptor
- **THEN** registration fails before publishing any listener registration

#### Scenario: One event per class

- **WHEN** an application reacts to multiple EventClasses
- **THEN** it composes multiple ListenerClasses rather than one wildcard or multi-event subscription

### Requirement: Managed ListenerInstance subscription

ListenerInstance creation MUST require an active same-runtime ListenerClass registration and an active authorized endpoint channel. Each instance SHALL have a runtime-qualified identity, monotonic endpoint installation sequence, observable managed status, active-only callback capability, and deterministic membership cleanup. Endpoint release SHALL own listener cleanup, while individual listener release SHALL remove only that subscription.

#### Scenario: Install listener

- **WHEN** ListenerFactory installs a registered ListenerClass on an authorized endpoint channel
- **THEN** one active runtime-owned ListenerInstance becomes eligible in endpoint installation order

#### Scenario: Registration dependency

- **WHEN** a ListenerClass registration has active ListenerInstances
- **THEN** replacement or unregistration fails without mutation until every dependent listener releases

#### Scenario: Release listener

- **WHEN** a ListenerInstance releases
- **THEN** endpoint membership and live callback, class, middleware, and endpoint references are cleared and repeated release repeats no cleanup

### Requirement: Deterministic serial listener reaction

Endpoint publication SHALL snapshot active matching listeners at reaction start and await them serially in installation order. Listeners installed after the snapshot MUST NOT join that publication. A snapshotted listener released before its turn SHALL be skipped. Listener callback context SHALL be frozen and contain the active EventInstance, source endpoint, channel, and current ListenerInstance.

Callbacks MUST resolve to exactly `undefined` or boolean `false`. `false` SHALL end the current endpoint publication successfully without invoking later listeners. Any other return value or callback exception SHALL fail publication and prevent later listener execution.

#### Scenario: Ordered asynchronous listeners

- **WHEN** multiple listeners include asynchronous callbacks
- **THEN** each callback completes before the next listener begins and observed order matches installation sequence

#### Scenario: Listener installed during publication

- **WHEN** a callback installs another matching listener
- **THEN** the new listener is absent from the current immutable reaction snapshot and eligible only for later publications

#### Scenario: Explicit false

- **WHEN** a callback resolves to boolean false
- **THEN** publication completes as a silent short-circuit and no later listener executes

#### Scenario: Invalid return or exception

- **WHEN** a callback throws, rejects, or resolves to any value other than undefined or false
- **THEN** publication fails explicitly, no later listener executes, and EventInstance finalization still runs

### Requirement: Awaited onion middleware

Listener middleware SHALL use immutable helper-proven definitions with optional asynchronous before and after hooks. Before hooks SHALL run outer-to-inner, followed by at most one callback, and after hooks for entered middleware SHALL run inner-to-outer. A before hook MUST resolve to exactly undefined or boolean false. A before result of false SHALL skip inner hooks and the callback, run entered after hooks, and short-circuit endpoint publication successfully. An after hook MUST resolve to exactly undefined; false or any other value SHALL be an after failure and MUST NOT prevent remaining entered after hooks from unwinding.

Thrown or rejected before hooks MUST interrupt normal execution while still running after hooks for previously entered middleware. Thrown, rejected, or invalid-returning after hooks MUST be collected while remaining entered after hooks continue. The system MUST report one ListenerExecutionError preserving the primary failure and every ordered after-hook failure. Middleware MUST NOT expose callback-style continuation control.

#### Scenario: Successful onion order

- **WHEN** two middleware definitions wrap one listener callback
- **THEN** execution order is before-one, before-two, callback, after-two, after-one

#### Scenario: Before short-circuit

- **WHEN** a before hook resolves to false
- **THEN** no inner hook or callback runs, entered after hooks unwind in reverse order, and publication short-circuits silently

#### Scenario: Callback and after failures

- **WHEN** the callback fails and one or more entered after hooks also fail
- **THEN** one execution error preserves the callback as primary and all after failures in unwind order

#### Scenario: Invalid after return

- **WHEN** an after hook resolves to false or any value other than undefined
- **THEN** the value is reported as an after failure and every remaining entered after hook still runs

### Requirement: Managed semantic relayers

The system SHALL implement a relayer as a managed ListenerInstance composition. A relayer SHALL receive one source EventInstance snapshot, map it to caller-owned payload data, and publish a newly created semantic event through an authorized same-runtime target endpoint/channel. The target event MUST receive independent identity, snapshot, phases, trace, and release.

Relayers MUST NOT forward the source EventInstance, raw source, native event state, trace Error objects, or default-prevention state. Cross-runtime targets MUST fail before mapping. Relay cycles exceeding the internal depth bound MUST fail explicitly and still finalize every created EventInstance.

#### Scenario: Relay between endpoints

- **WHEN** a source endpoint publishes a matching event to a relayer
- **THEN** the target endpoint receives a new semantic event with mapped detached payload and independent lifecycle

#### Scenario: Reject cross-runtime relay

- **WHEN** relayer creation receives source and target authorities from different runtimes
- **THEN** creation fails with an ownership error before mapper execution or listener installation

#### Scenario: Relay cycle bound

- **WHEN** nested relayers exceed the framework relay-depth limit
- **THEN** publication fails explicitly and all active source and target events run guaranteed finalization

### Requirement: Non-cancellable listener lifecycle observation

The listener domain SHALL define a closed ListenerLifecyclePhase enum and emit deeply frozen strict-JSON lifecycle records for caller-created endpoint created/released and listener installed/released phases. The permanent internal default endpoint SHALL emit no synthetic creation record. An optional asynchronous observer SHALL be awaited in sequence. Observer return values MUST NOT cancel, short-circuit, or mutate lifecycle state. Observer failure during endpoint creation or listener installation MUST roll the new resource back before rejection. Observer failure during release MUST be reported after required cleanup continues.

#### Scenario: Observe installation and release

- **WHEN** an endpoint and listener are created and later released
- **THEN** the observer receives immutable scalar records in lifecycle order without live endpoint, listener, callback, or EventInstance references

#### Scenario: Observer attempts cancellation

- **WHEN** an observer returns false or another value
- **THEN** the framework ignores the return value and continues the lifecycle operation

#### Scenario: Observer fails during cleanup

- **WHEN** an observer throws or rejects while a listener or endpoint releases
- **THEN** remaining cleanup runs and the lifecycle operation reports the observer failure explicitly

#### Scenario: Observer fails during creation

- **WHEN** an observer throws or rejects for endpoint created or listener installed
- **THEN** the operation rejects only after rolling back the newly allocated endpoint or listener and every retained dependency

### Requirement: Public listener-domain boundary

The public core entry SHALL expose EventEndpoint, ListenerClass, ListenerInstance, middleware, relayer, channel, lifecycle record, and listener-domain error contracts without exposing generic listener registries, internal reaction ports, endpoint storage, phase mutation, or deferred browser/component/plugin APIs.

#### Scenario: Import listener APIs

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** managed listener and endpoint contracts are available while their generic kernels and deferred domains remain unavailable

### Requirement: Framework-independent listener core

Endpoint, listener, middleware, relay, and lifecycle contracts MUST remain usable in Node.js without DOM, JSX, CSS, renderer, browser Event, or reactive-library dependencies.

#### Scenario: Execute listener core in Node.js

- **WHEN** the listener-domain test suite runs in a Node.js environment
- **THEN** public/private publication, middleware, relays, lifecycle, ownership rejection, tracing, and cleanup complete without browser globals
