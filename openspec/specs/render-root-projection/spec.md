# Render Root Projection

## Purpose

Define a framework-independent renderer port, managed RootHandle projection of render plans, permanent runtime-assigned root identity, managed commit repair, and an in-memory fake renderer, so a renderer surface is observable but never the source of runtime identity or ownership.

## Requirements

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

### Requirement: Managed RootHandle projection

Mounting a component instance's resolved render plan SHALL produce one owner-validated managed `RootHandle` per named root. Each RootHandle SHALL have opaque runtime ownership, a runtime-qualified identity, observable managed status, and an idempotent release that removes its root through the port. A foreign-runtime instance MUST be rejected before any port call, and releasing the projection SHALL remove every owned root.

#### Scenario: Mount a multi-root plan

- **WHEN** a component instance whose plan has two named roots is projected
- **THEN** the projection exposes one owner-validated RootHandle per root, each active and created through the port

#### Scenario: Reject a foreign instance

- **WHEN** projection receives a component instance owned by another runtime
- **THEN** it fails with an ownership error before invoking the renderer port

#### Scenario: Release a root

- **WHEN** a RootHandle is released
- **THEN** its root is removed through the port, repeated release repeats no port call, and its status becomes released

### Requirement: Permanent projection identity

The runtime SHALL assign each projected root a stable identity token that is independent of the render plan and never derived from selectors, the DOM, or surface content. The token SHALL be written to the projected surface as a permanent attribute at creation and SHALL remain stable across every commit to that root.

#### Scenario: Stable identity across commits

- **WHEN** a root is projected and then committed again with a new plan
- **THEN** the root's identity token is unchanged and remains present on the surface

#### Scenario: Identity is runtime-assigned

- **WHEN** two roots are projected for the same instance
- **THEN** each carries a distinct runtime-assigned identity token that does not depend on the render plan's content

### Requirement: Managed commit repair

Committing a plan to a RootHandle SHALL re-apply the permanent identity attribute to the surface. If the identity attribute was removed or altered on the surface between commits, the commit MUST repair it to the runtime-assigned value without changing the token.

#### Scenario: Repair a removed identity attribute

- **WHEN** the identity attribute is removed from a projected root's surface and the root is committed again
- **THEN** the commit restores the original runtime-assigned identity attribute

#### Scenario: Commit updates content but preserves identity

- **WHEN** a root is committed with a plan whose nodes differ from the previous commit
- **THEN** the surface reflects the new nodes while the identity attribute remains the runtime-assigned token

### Requirement: Ownership independent of the surface

Runtime ownership and RootHandle authority MUST NOT depend on the projected surface. Identity tokens, surface attributes, strings, and selectors MUST NOT grant a RootHandle or authorize an operation, and a foreign or imitation RootHandle MUST be rejected before any port call.

#### Scenario: Reject a foreign RootHandle

- **WHEN** a projection operation receives a RootHandle owned by another runtime
- **THEN** it fails with an ownership error before invoking the renderer port

#### Scenario: Surface identity does not grant authority

- **WHEN** a caller presents a copied identity token or a structural imitation of a RootHandle
- **THEN** the operation is rejected and no root is committed or removed

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

### Requirement: Public projection-domain boundary

The public core entry SHALL expose the RendererPort contract, the projection runtime, RootHandle, projection identity, the fake renderer, and projection-domain error contracts without exposing generic registries, factory kernels, projection internals, or deferred real-renderer, layout, or reactive APIs.

#### Scenario: Import projection APIs

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** the renderer port, projection runtime, RootHandle, and fake renderer are available while generic kernels and deferred domains remain unavailable

### Requirement: Framework-independent projection core

The renderer port, projection runtime, RootHandle, identity, commit repair, interaction registration, and fake renderer MUST remain usable in Node.js without DOM, JSX, CSS, real-renderer, browser `Event`, or reactive-library dependencies. Interaction registration MUST carry only immutable snapshots inward and MUST NOT introduce a browser `Event` dependency into core.

#### Scenario: Execute projection core in Node.js

- **WHEN** the projection test suite runs in a Node.js environment
- **THEN** port invocation, mounting, identity assignment, commit repair, interaction registration and delivery, ownership rejection, and cleanup all execute without browser globals
