## ADDED Requirements

### Requirement: Interaction routed through the neutral port

The validation SHALL drive editor interactions through the renderer port and the interaction-binding contract, not through application-level DOM selection or a native listener attached to a queried element. Each editor's Button interaction MUST be bound to its business EventClass so that a captured interaction dispatches the semantic event via the runtime's own contracts, and the validation MUST NOT use `data-velkren-root` selectors or `addEventListener` for coordination.

#### Scenario: Business event flows through binding

- **WHEN** an editor's Button is activated and the adapter captures the interaction
- **THEN** the runtime dispatches the editor's business semantic event through the interaction-binding contract, and the validation performs no DOM query or native listener attachment to observe it

## MODIFIED Requirements

### Requirement: Template change preserves business events

Replacing an editor's template MUST preserve its business semantic-event wiring through the interaction-binding contract. Re-templating commits a new plan to the same root, so the root's interaction binding MUST remain intact and the Button MUST still emit its business semantic event through the runtime's event contracts, while the new template renders through the adapter.

#### Scenario: Re-template keeps the business event

- **WHEN** an editor's template is replaced by committing a new plan to its root, and its Button is then activated
- **THEN** the runtime observes the same business semantic event as before the replacement through the unchanged binding, and the surface reflects the new template
