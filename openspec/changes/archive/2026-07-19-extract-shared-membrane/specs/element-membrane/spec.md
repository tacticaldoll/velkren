## ADDED Requirements

### Requirement: Renderer-agnostic membrane core shared across adapters

The membrane SHALL be a renderer-agnostic core parameterized by an injected renderer
factory, so the same core is realized by more than one adapter with no
`@velkren/core` change. The core MUST NOT import any renderer (no Solid, no React); it
SHALL depend only on `@velkren/core` types and the DOM. Each adapter SHALL provide a
thin wrapper that binds the core to its own renderer factory and expose the membrane
under its package. The membrane's observable behavior — registration, ephemeral
ownership, move-safe detach, the shadow surface, interaction, and outward events —
SHALL be identical across adapters.

#### Scenario: The same core runs on two adapters

- **WHEN** the shared membrane core is bound to the Solid adapter's renderer factory and, separately, to the React adapter's renderer factory
- **THEN** a membrane defined through either adapter mounts, isolates, captures interactions, relays outward events, and disposes with the same observable behavior, and neither requires a `@velkren/core` change

#### Scenario: The core imports no renderer

- **WHEN** the shared membrane core package is built and its dependencies are inspected
- **THEN** it depends only on `@velkren/core` and the DOM, and imports neither Solid nor React

#### Scenario: An adapter binds the core with a thin wrapper

- **WHEN** an adapter exposes the membrane
- **THEN** it does so by binding the shared core to its own renderer factory, and re-exports the membrane types so existing membrane definitions keep working
