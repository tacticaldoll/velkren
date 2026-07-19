## ADDED Requirements

### Requirement: Registered, typed interaction vocabulary

The system SHALL provide `createInteractionType(slug, native)` producing an immutable,
portable `InteractionType` with a stable identity (`id` / `localSlug`) distinct from the
`native` event name an adapter captures, mirroring `EventClass`. An `InteractionType`
SHALL be registered on the interaction-binding domain (`registerInteractionType`) before
it can be bound; registering a second type with the same local slug SHALL be rejected
(no last-write-wins). A raw string SHALL require no registration.

#### Scenario: A typed interaction carries identity distinct from the native name

- **WHEN** an `InteractionType` is created with a slug and a native event name
- **THEN** it exposes a stable identity separate from the native name, and `isInteractionType` recognizes it

#### Scenario: Duplicate registration is rejected

- **WHEN** a second `InteractionType` with the same local slug is registered on a binding domain
- **THEN** registration fails and the first registration is unchanged

### Requirement: Bind accepts a registered InteractionType or a raw string

`bind` SHALL accept either a registered `InteractionType` or a raw string. Given an
`InteractionType`, it SHALL fail if the type is not registered on this binding domain,
and otherwise resolve the type's `native` name for the renderer port. Given a string, it
SHALL behave exactly as before. The `RendererPort` and every adapter SHALL be unchanged —
the native string is resolved core-side and the port still receives a string.

#### Scenario: A registered InteractionType resolves to its native name

- **WHEN** a registered `InteractionType` is bound on a root and its native event occurs
- **THEN** the binding delivers the interaction and dispatches the mapped event, exactly as a raw-string binding for the same native name would

#### Scenario: An unregistered InteractionType is rejected

- **WHEN** `bind` is called with an `InteractionType` that was not registered on the binding domain
- **THEN** it fails and creates no binding or port registration

#### Scenario: The raw-string path is unchanged

- **WHEN** `bind` is called with a raw string
- **THEN** it binds the interaction exactly as before, requiring no registration and changing no adapter
