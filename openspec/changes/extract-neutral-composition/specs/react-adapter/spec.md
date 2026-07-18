## MODIFIED Requirements

### Requirement: Cross-framework validation of renderer independence

The adapter package SHALL validate renderer independence by mounting the **shared** renderer-agnostic two-editor composition (`createEditorApp` from `@velkren/two-editor-validation`) with the React renderer injected, rather than a parallel React-specific copy. Two editors MUST coexist with distinct identities, each editor's interaction MUST emit its business semantic event through the interaction-binding contract, and destroying one editor MUST release only its owned roots and registrations while the other remains functional — the same guarantees the SolidJS injection satisfies, proving the identical composition is renderer-independent.

#### Scenario: Core semantics hold on React through the shared composition

- **WHEN** the shared two-editor composition is mounted with the React renderer injected, exercised, and one editor is destroyed
- **THEN** identity isolation, business-event emission through the binding, and scoped disposal all hold, with the surviving editor still emitting its event — with no React-specific copy of the composition
