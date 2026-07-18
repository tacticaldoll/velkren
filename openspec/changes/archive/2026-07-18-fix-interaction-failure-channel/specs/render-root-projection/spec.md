## MODIFIED Requirements

### Requirement: In-memory fake renderer

The system SHALL provide a framework-owned in-memory fake renderer that implements the RendererPort for tests. It SHALL build an inspectable node tree from render nodes, record the identity attribute on each root, implement declarative interaction registration, and expose read access to the projected tree and identity without any browser global. The fake renderer SHALL provide a test-only way to simulate an interaction that invokes the registered delivery callback with a supplied snapshot. Simulation SHALL mirror real event-dispatch failure semantics: a throw from the delivery callback MUST NOT propagate out of the simulation, so the failure contract can only be observed through the binding's owned failure channel and never through a propagated throw the fake alone would surface.

#### Scenario: Inspect a fake-renderer projection

- **WHEN** a plan is projected through the fake renderer
- **THEN** the fake renderer exposes the resulting node tree and each root's identity attribute for inspection

#### Scenario: Fake renderer runs in Node.js

- **WHEN** the fake renderer projects, commits, repairs, registers interactions, and removes roots in a Node.js environment
- **THEN** every operation completes without a DOM, browser global, or reactive library

#### Scenario: Simulate an interaction through the fake renderer

- **WHEN** an interaction is registered on a fake-renderer root and the test simulates that interaction with a snapshot
- **THEN** the registered delivery callback is invoked with the supplied immutable snapshot

#### Scenario: Simulation swallows a delivery-callback throw

- **WHEN** a simulated interaction's delivery callback throws
- **THEN** the throw does not propagate out of the simulation, mirroring a real event system, so the failure is observed only through the binding's failure channel
