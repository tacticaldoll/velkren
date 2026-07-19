## ADDED Requirements

### Requirement: React adapter view registry

The React adapter SHALL accept an optional view registry and consult it by node `kind` in its `renderNode` path — for the root node and children alike — before the primitive `createElement(kind)`, rendering a registered React component on a hit and falling back to the primitive element on a miss. A registered view receives the node's `attributes` as props and is a self-contained leaf. The registry and React view types MUST remain in the adapter package; `@velkren/core` MUST NOT reference them.

#### Scenario: React adapter renders a registered view

- **WHEN** the React adapter is configured with a React component under a `kind` and projects a node with that `kind` (root or child)
- **THEN** it renders the registered React component for that node with the node's attributes as props

#### Scenario: React adapter falls back to the primitive on a miss

- **WHEN** a node's `kind` is not registered (or no registry is configured)
- **THEN** the React adapter renders it as a primitive DOM element unchanged
