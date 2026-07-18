# interaction-binding Specification

## Purpose

TBD - created by archiving change add-neutral-interaction-port. Update Purpose after archive.

## Requirements

### Requirement: Declarative interaction registration through the port

The system SHALL let core register interest in a named interaction type on an owned root and supply a delivery callback that receives only an immutable snapshot. Core SHALL resolve the owned `RootHandle` to its opaque adapter root and invoke the `RendererPort` interaction-registration operation on that adapter root; the port operation itself exchanges only the adapter root, an interaction-type string, and the delivery callback and never sees a `RootHandle`. Core MUST NOT learn how the adapter captures the interaction, and the operation MUST be expressible without any DOM, browser `Event`, JSX, or reactive-library type so it is usable in Node.js.

#### Scenario: Register interest without knowing the capture mechanism

- **WHEN** core registers interest in an interaction type on a root through the port and supplies a delivery callback
- **THEN** the adapter wires the interaction using its own framework event layer, and core observes only invocations of the delivery callback

#### Scenario: Registration carries no renderer types

- **WHEN** the interaction-registration operation is defined and invoked in Node.js
- **THEN** it exchanges only a root, an interaction-type string, and an immutable-snapshot callback, importing no DOM, browser `Event`, JSX, or reactive-library type

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

### Requirement: Managed binding lifecycle

Interaction bindings SHALL be owned by the runtime and cleaned up with the root they target. Releasing a RootHandle MUST remove its interaction registrations through the port and prevent any later delivery — including one already in flight when release begins — from dispatching an event; dispatch therefore MUST re-check that the binding is still live at delivery time, not rely on port removal alone. Freshly projecting a new root after releasing the old one MUST allow a binding to be registered against that new root.

#### Scenario: Release stops delivery

- **WHEN** a bound root is released and the adapter afterward reports an interaction for it
- **THEN** no semantic event is dispatched and the port registration has been removed

#### Scenario: Re-registration against a freshly projected root

- **WHEN** a bound root is released, a new root is freshly projected, and a binding is registered against it
- **THEN** reporting the interaction on the new root dispatches the bound event

### Requirement: Framework-neutral input core

The interaction-registration operation, the snapshot boundary, and the interaction-binding contract MUST remain usable in Node.js with the in-memory fake renderer and no DOM, browser `Event`, real renderer, or reactive-library dependency.

#### Scenario: Binding exercised with the fake renderer in Node.js

- **WHEN** the interaction-binding suite registers, delivers a simulated snapshot, dispatches, and releases through the fake renderer in Node.js
- **THEN** every step completes without a DOM, browser global, or reactive library

### Requirement: Public interaction-binding boundary

The public core entry SHALL expose the interaction-binding contract and its error types alongside the renderer port, without exposing binding internals or the runtime's generic registries and factory kernels.

#### Scenario: Import interaction-binding APIs

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** the interaction-binding contract and its errors are available while binding internals and generic kernels remain unavailable

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
