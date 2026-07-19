## ADDED Requirements

### Requirement: SolidJS adapter view registry

The SolidJS adapter SHALL accept an optional view registry and consult it by node `kind` — for the root node and children alike — before its primitive `document.createElement`, rendering a registered Solid view on a hit within the root's reactive owner (so its effects dispose on unmount) and falling back to the primitive element on a miss. A registered view receives the node's `attributes` as props and is a self-contained leaf. The registry and Solid view types MUST remain in the adapter package; `@velkren/core` MUST NOT reference them.

#### Scenario: Solid adapter renders a registered view

- **WHEN** the Solid adapter is configured with a Solid view under a `kind` and projects a node with that `kind` (root or child)
- **THEN** it renders the registered Solid view for that node with the node's attributes as props

#### Scenario: Solid adapter falls back to the primitive on a miss

- **WHEN** a node's `kind` is not registered (or no registry is configured)
- **THEN** the Solid adapter renders it as a primitive DOM element unchanged
