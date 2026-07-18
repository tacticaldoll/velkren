## MODIFIED Requirements

### Requirement: Framework-independent renderer port

The system SHALL define a `RendererPort` contract that a renderer adapter implements. The port SHALL receive renderer-neutral render nodes and a runtime-assigned identity token and return an opaque adapter root, and it SHALL expose commit, identity read, removal, and declarative interaction-registration operations. The interaction-registration operation SHALL accept an adapter root, an interaction-type string, and a delivery callback that receives only an immutable snapshot, and it SHALL return a means to remove that registration. Core MUST NOT import DOM, JSX, CSS, renderer, browser `Event`, or reactive-library types, and the port MUST be usable in Node.js.

#### Scenario: Implement the port without browser types

- **WHEN** an adapter implements the RendererPort using only renderer-neutral render nodes, identity tokens, and immutable interaction snapshots
- **THEN** the projection runtime drives it without core importing any DOM, JSX, browser `Event`, or renderer type

#### Scenario: Reject a non-conforming renderer

- **WHEN** a projection runtime is created with a value that does not implement the required port operations, including interaction registration
- **THEN** creation fails explicitly without projecting anything

#### Scenario: Adapter captures interaction and delivers a snapshot

- **WHEN** core registers interest in an interaction type on a root through the port and the adapter observes that interaction
- **THEN** the adapter invokes the delivery callback with an immutable snapshot and never passes a live node or native event to core

### Requirement: In-memory fake renderer

The system SHALL provide a framework-owned in-memory fake renderer that implements the RendererPort for tests. It SHALL build an inspectable node tree from render nodes, record the identity attribute on each root, implement declarative interaction registration, and expose read access to the projected tree and identity without any browser global. The fake renderer SHALL provide a test-only way to simulate an interaction that invokes the registered delivery callback with a supplied snapshot.

#### Scenario: Inspect a fake-renderer projection

- **WHEN** a plan is projected through the fake renderer
- **THEN** the fake renderer exposes the resulting node tree and each root's identity attribute for inspection

#### Scenario: Fake renderer runs in Node.js

- **WHEN** the fake renderer projects, commits, repairs, registers interactions, and removes roots in a Node.js environment
- **THEN** every operation completes without a DOM, browser global, or reactive library

#### Scenario: Simulate an interaction through the fake renderer

- **WHEN** an interaction is registered on a fake-renderer root and the test simulates that interaction with a snapshot
- **THEN** the registered delivery callback is invoked with the supplied immutable snapshot

### Requirement: Framework-independent projection core

The renderer port, projection runtime, RootHandle, identity, commit repair, interaction registration, and fake renderer MUST remain usable in Node.js without DOM, JSX, CSS, real-renderer, browser `Event`, or reactive-library dependencies. Interaction registration MUST carry only immutable snapshots inward and MUST NOT introduce a browser `Event` dependency into core.

#### Scenario: Execute projection core in Node.js

- **WHEN** the projection test suite runs in a Node.js environment
- **THEN** port invocation, mounting, identity assignment, commit repair, interaction registration and delivery, ownership rejection, and cleanup all execute without browser globals
