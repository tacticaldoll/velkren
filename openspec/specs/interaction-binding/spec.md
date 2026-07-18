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

Core SHALL own the boundary through which a reported interaction enters the runtime. Only an immutable JSON snapshot MAY cross inward; a live surface node, native event object, or renderer-native reactive value MUST NOT. A delivered snapshot MUST be frozen before any runtime code observes it.

#### Scenario: Only a frozen snapshot crosses inward

- **WHEN** an adapter reports an interaction through the registered delivery callback
- **THEN** the runtime observes a frozen JSON snapshot and never receives a live node, native event, or reactive value

#### Scenario: Reject a non-object snapshot

- **WHEN** an adapter delivers a value that is not a plain JSON object (for example a function, a live node, or a primitive) as the snapshot
- **THEN** the boundary rejects it explicitly and dispatches no semantic event

### Requirement: Interaction-to-event binding

The system SHALL provide an interaction-binding contract that maps a `(RootHandle, interaction-type)` pair to a registered `EventClass` and a payload projection from the snapshot. When the adapter reports a matching interaction, the runtime SHALL dispatch the mapped semantic event through the existing event contracts, using the projected payload. Binding MUST reject a foreign-runtime RootHandle before registering anything, and the payload projection MUST produce a value the EventClass's closed schema accepts.

#### Scenario: A reported interaction dispatches its bound event

- **WHEN** a root is bound so its `activate` interaction maps to a registered EventClass, and the adapter later reports that interaction
- **THEN** the runtime dispatches that EventClass through its own event contracts with the payload projected from the snapshot

#### Scenario: Reject a foreign root

- **WHEN** interaction binding receives a RootHandle owned by another runtime
- **THEN** it fails with an ownership error before registering any interaction through the port

#### Scenario: Payload must satisfy the event schema

- **WHEN** a binding's payload projection would produce a value the bound EventClass's closed schema rejects
- **THEN** dispatch fails explicitly and no partially-populated event is observed

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

