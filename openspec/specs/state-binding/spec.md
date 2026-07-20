# state-binding Specification

## Purpose

Define a per-runtime state-binding domain: the output-side coordinator, symmetric to interaction-binding, that maps a `StateHandle` value to a `RenderNode` through a pure derivation and commits it through the projection on bind and on every state change. It closes the reactive loop `interaction → event → listener → state → binding → commit`, driving a projected view from runtime state with no renderer-native or reactive-library type in its contract.

## Requirements

### Requirement: Owner-validated state-binding domain

The system SHALL provide a per-runtime state-binding domain created with `createStateBinding(runtime, projection)`, and a second state-binding domain on the same runtime SHALL be rejected. Its `bind(root, state, derive)` SHALL require the runtime to own both the projected `RootHandle` and the `StateHandle` and both to be active, rejecting a foreign-runtime or released target. A `RootHandle` that already has a live binding MUST be rejected until that binding is released.

#### Scenario: One state-binding domain per runtime

- **WHEN** `createStateBinding` is called twice on the same runtime
- **THEN** the second call fails with a duplicate-domain error

#### Scenario: Binding a foreign or already-bound root is rejected

- **WHEN** `bind` is called with a root or state the runtime does not own, or with a root that already has a live binding
- **THEN** it fails with an ownership error or an already-bound error and registers no observer

### Requirement: Derive and commit the view from state

The state-binding domain SHALL bind a `StateHandle` to a projected `RootHandle` through a pure derivation `derive(value) => RenderNode`. On `bind` it SHALL derive a node from the state's current value and commit it once through the projection, then observe the state and commit a freshly derived node on every subsequent change. The derivation and the domain's contract MUST NOT expose any renderer-native or reactive-library type; the only reactivity is the state's own observation.

#### Scenario: Bind commits the initial state-derived view

- **WHEN** a state handle holding an initial value is bound to a projected root with a derivation
- **THEN** the projection commits the node derived from that initial value

#### Scenario: A state update re-commits the derived view

- **WHEN** the bound state is updated to a new value
- **THEN** the projection commits the node derived from the new value

### Requirement: Deterministic binding teardown

A state binding SHALL stop committing when it is released, when its state is released, or when its root is released. `bind` SHALL return a handle whose `release()` stops further commits and is idempotent. Releasing the state SHALL stop notifications through the state's own observer cleanup. A state change delivered after the root is released MUST NOT commit and MUST remove the now-dead observation.

#### Scenario: Releasing the binding stops further commits

- **WHEN** a binding's `release()` is called and the state is then updated
- **THEN** the projection is not committed for that update, and a second `release()` does nothing

#### Scenario: A state change after the root is released is a no-op

- **WHEN** the bound root is released and the state is then updated
- **THEN** no commit occurs for that update and the binding's observation is removed
