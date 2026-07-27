## MODIFIED Requirements

### Requirement: Vue neutral-composition validation

The Vue adapter SHALL pass the shared neutral composition's validation
(`createEditorApp(createVueRenderer())`) — two editors coexist without collision, a
business event is observed through the event trace, and destroying one editor releases
only its owned work — with no `@velkren/core` change and no Vue dev warning.

#### Scenario: Two editors isolate, emit, and dispose on Vue

- **WHEN** the shared neutral composition is mounted on the Vue renderer, both editors are interacted with, and one is destroyed
- **THEN** the two never collide, each business event is observed through the trace, destroying one releases only its work, and no Vue dev warning is emitted
