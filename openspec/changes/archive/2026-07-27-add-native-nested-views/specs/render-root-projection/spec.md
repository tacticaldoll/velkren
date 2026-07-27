## MODIFIED Requirements

### Requirement: Framework-independent renderer port

The system SHALL define a `RendererPort` contract that a renderer adapter implements. The port SHALL receive renderer-neutral render nodes and a runtime-assigned identity token and return an opaque adapter root, and it SHALL expose commit, identity read, removal, declarative interaction-registration, and child-mounting operations. The interaction-registration operation SHALL accept an adapter root, an interaction-type string, and a delivery callback that receives only an immutable snapshot, and it SHALL return a means to remove that registration. The child-mounting operation SHALL accept a parent adapter root, an anchor name string, an identity token, and a render node, and SHALL return a new opaque adapter root mounted at the named anchor within the parent. Core MUST NOT import DOM, JSX, CSS, renderer, browser `Event`, or reactive-library types, and the port MUST be usable in Node.js.

#### Scenario: Implement the port without browser types

- **WHEN** an adapter implements the RendererPort using only renderer-neutral render nodes, identity tokens, and immutable interaction snapshots
- **THEN** the projection runtime drives it without core importing any DOM, JSX, browser `Event`, or renderer type

#### Scenario: Reject a non-conforming renderer

- **WHEN** a projection runtime is created with a value that does not implement the required port operations, including interaction registration and child mounting
- **THEN** creation fails explicitly without projecting anything

#### Scenario: Adapter captures interaction and delivers a snapshot

- **WHEN** core registers interest in an interaction type on a root through the port and the adapter observes that interaction
- **THEN** the adapter invokes the delivery callback with an immutable snapshot and never passes a live node or native event to core

### Requirement: In-memory fake renderer

The system SHALL provide a framework-owned in-memory fake renderer that implements the RendererPort for tests. It SHALL build an inspectable node tree from render nodes, record the identity attribute on each root, implement declarative interaction registration and child mounting, and expose read access to the projected tree and identity without any browser global. The fake renderer SHALL provide a test-only way to simulate an interaction that invokes the registered delivery callback with a supplied snapshot. Simulation SHALL mirror real event-dispatch failure semantics: a throw from the delivery callback MUST NOT propagate out of the simulation, so the failure contract can only be observed through the binding's owned failure channel and never through a propagated throw the fake alone would surface.

#### Scenario: Inspect a fake-renderer projection

- **WHEN** a plan is projected through the fake renderer
- **THEN** the fake renderer exposes the resulting node tree and each root's identity attribute for inspection

#### Scenario: Fake renderer runs in Node.js

- **WHEN** the fake renderer projects, commits, repairs, registers interactions, mounts a child, and removes roots in a Node.js environment
- **THEN** every operation completes without a DOM, browser global, or reactive library

#### Scenario: Simulate an interaction through the fake renderer

- **WHEN** an interaction is registered on a fake-renderer root and the test simulates that interaction with a snapshot
- **THEN** the registered delivery callback is invoked with the supplied immutable snapshot

#### Scenario: Simulation swallows a delivery-callback throw

- **WHEN** a simulated interaction's delivery callback throws
- **THEN** the throw does not propagate out of the simulation, mirroring a real event system, so the failure is observed only through the binding's failure channel

## ADDED Requirements

### Requirement: Nested child projection anchored to a parent root

The projection runtime SHALL expose a `mountChild` operation accepting a parent `RootHandle`, an anchor name string, a component instance, and a render plan, and SHALL produce a new owner-validated `Projection` whose roots are each created through the renderer port's child-mounting operation, anchored under the given parent root at the named anchor. The parent instance and the child instance MAY belong to different component classes. Releasing the parent `RootHandle` SHALL cascade to release the child projection. Releasing the child projection independently, without releasing the parent, SHALL also succeed, and either release order MUST remain idempotent with no double release and no failure from releasing the other side afterward.

#### Scenario: A child projection mounts anchored to a parent root

- **WHEN** `mountChild` is called with an active parent `RootHandle`, an anchor name, and a resolved plan for a child component instance
- **THEN** the renderer port's child-mounting operation is invoked for each of the child plan's named roots, anchored under the parent, and a `Projection` owning the resulting `RootHandle`s is returned

#### Scenario: Releasing the parent cascades to the child

- **WHEN** a parent root with a mounted child projection is released
- **THEN** the child projection is also released, through the same cascade that already binds an interaction registration's removal to its root's release

#### Scenario: Releasing the child independently does not disturb the parent

- **WHEN** a child projection is released directly, without releasing its parent root
- **THEN** the parent root remains active and unaffected, and the parent's later release does not attempt to release the child a second time

#### Scenario: A rejected instance never reaches the port

- **WHEN** `mountChild` receives a parent `RootHandle` or a child component instance owned by another runtime
- **THEN** it fails with an ownership error before invoking the renderer port's child-mounting operation
