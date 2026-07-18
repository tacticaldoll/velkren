## ADDED Requirements

### Requirement: Owned interaction failure channel

The runtime SHALL own an observable channel for delivery-time interaction failures. Bind-time misuse (a foreign root or a duplicate active binding) throws synchronously because application code calls `bind` directly; delivery-time failures, which occur inside the adapter's event callback, route to this channel instead. `createInteractionBinding` SHALL accept an optional `onFailure` observer, and when a reported interaction fails at delivery time the binding SHALL surface a typed failure — carrying the target `RootHandle`, the interaction type, a reason of `non-object-snapshot`, `invalid-payload`, `projection-error`, or `dispatch-error`, and the underlying cause — and dispatch no semantic event. Delivery-time failure surfacing MUST NOT depend on an exception propagating out of the adapter's event callback, and MUST NOT re-throw synchronously into that callback. A delivery-time failure MUST NOT be silently lost: if no observer is registered, the failure SHALL be reported through a default reporter resolved at call time — `globalThis.reportError` when it is a function, otherwise `console.error` (the fallback is required, since `globalThis.reportError` is not reliably present on the supported Node engines). The reporter call MUST NOT throw out of the delivery path. The retained `NonObjectSnapshotError` and `InvalidInteractionPayloadError` classes SHALL be carried as the failure `cause`. If a registered observer itself throws, the binding SHALL contain that throw and route it to the same default reporter rather than into the adapter's event callback. A delivery for a released or dead binding SHALL surface neither an event nor a failure — the liveness check gates failure surfacing as well as dispatch.

#### Scenario: Delivery-time failure surfaces to the observer

- **WHEN** a bound interaction is reported whose snapshot is not a plain object, whose projection is schema-invalid, whose projection throws, or whose dispatch rejects, and an `onFailure` observer is registered
- **THEN** the observer receives one typed failure with the matching reason and cause, and no semantic event completes

#### Scenario: Failure does not require throw propagation

- **WHEN** an adapter reports such a failing interaction from inside an event callback that swallows exceptions
- **THEN** the failure is still surfaced through the observer and no event is dispatched, and nothing is re-thrown synchronously into the callback

#### Scenario: No observer never means silent loss

- **WHEN** a delivery-time failure occurs and no `onFailure` observer is registered
- **THEN** the failure is reported through the default reporter (`globalThis.reportError` when present, otherwise `console.error`), carrying the original error as its cause, and no semantic event is dispatched

#### Scenario: Dispatch rejection surfaces as a failure

- **WHEN** a bound interaction's projected payload is valid but the resulting event dispatch rejects
- **THEN** a `dispatch-error` failure carrying the rejection as its cause is surfaced through the channel rather than the rejection being silently discarded

#### Scenario: A released binding surfaces neither event nor failure

- **WHEN** a delivery races the release of its binding or root — even one carrying a malformed snapshot
- **THEN** no event is dispatched and no failure is surfaced, so normal teardown raises no error report

#### Scenario: A throwing observer is contained

- **WHEN** a registered `onFailure` observer throws while handling a failure
- **THEN** the observer's throw does not propagate into the adapter's event callback and is routed to the default reporter

## MODIFIED Requirements

### Requirement: Immutable inward snapshot boundary

Core SHALL own the boundary through which a reported interaction enters the runtime. Only an immutable JSON snapshot MAY cross inward; a live surface node, native event object, or renderer-native reactive value MUST NOT. A delivered snapshot MUST be frozen before any runtime code observes it. A snapshot that is not a plain JSON object is a delivery-time failure: the boundary SHALL reject it, dispatch nothing, and surface a `non-object-snapshot` failure through the owned failure channel rather than by propagating a throw out of the adapter's event callback.

#### Scenario: Only a frozen snapshot crosses inward

- **WHEN** an adapter reports an interaction through the registered delivery callback
- **THEN** the runtime observes a frozen JSON snapshot and never receives a live node, native event, or reactive value

#### Scenario: Reject a non-object snapshot

- **WHEN** an adapter delivers a value that is not a plain JSON object (for example a function, a live node, or a primitive) as the snapshot
- **THEN** the boundary rejects it, dispatches no semantic event, and surfaces a `non-object-snapshot` failure through the owned failure channel

### Requirement: Interaction-to-event binding

The system SHALL provide an interaction-binding contract that maps a `(RootHandle, interaction-type)` pair to a registered `EventClass` and a payload projection from the snapshot. When the adapter reports a matching interaction, the runtime SHALL dispatch the mapped semantic event through the existing event contracts, using the projected payload. Binding MUST reject a foreign-runtime RootHandle before registering anything. When a delivered interaction's payload projection produces a value the EventClass's closed schema rejects, or the projection itself throws, the binding SHALL dispatch nothing and surface the failure through the owned failure channel rather than by propagating a throw out of the adapter's event callback.

#### Scenario: A reported interaction dispatches its bound event

- **WHEN** a root is bound so its `activate` interaction maps to a registered EventClass, and the adapter later reports that interaction
- **THEN** the runtime dispatches that EventClass through its own event contracts with the payload projected from the snapshot

#### Scenario: Reject a foreign root

- **WHEN** interaction binding receives a RootHandle owned by another runtime
- **THEN** it fails with an ownership error before registering any interaction through the port

#### Scenario: Schema-invalid payload surfaces a failure with no partial event

- **WHEN** a delivered interaction's payload projection produces a value the bound EventClass's closed schema rejects
- **THEN** no event is dispatched, no partially-populated event is observed, and an `invalid-payload` failure is surfaced through the owned failure channel

#### Scenario: Reject a duplicate active binding

- **WHEN** a `(RootHandle, interaction-type)` pair that is already actively bound is bound again
- **THEN** the second bind fails explicitly rather than resolving through last-write-wins, and no second port registration is created
