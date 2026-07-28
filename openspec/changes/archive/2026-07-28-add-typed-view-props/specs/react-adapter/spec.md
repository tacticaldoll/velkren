## MODIFIED Requirements

### Requirement: React adapter view registry

The React adapter SHALL accept an optional view registry and consult it in its `renderNode` path — for the root node and children alike — only for a **view node** (a node carrying `node: "view"`), keyed by that node's `viewId`; a primitive node (carrying `kind`) MUST NOT trigger a registry lookup and always renders via `createElement(kind)`, unchanged. On a hit the adapter renders the registered React component, passing the view node's `props` as its props. A view node has no tag name to fall back to, so the React adapter MUST throw a clear error identifying the unregistered `viewId` when a view node's `viewId` is not registered (including when no registry is configured). The registry and React view types MUST remain in the adapter package; `@velkren/core` MUST NOT reference them.

#### Scenario: React adapter renders a registered view

- **WHEN** the React adapter is configured with a React component under a `viewId` and projects a view node with that `viewId` (root or child)
- **THEN** it renders the registered React component for that node with the node's `props` as props

#### Scenario: React adapter throws on an unregistered viewId

- **WHEN** a view node's `viewId` is not registered (or no registry is configured)
- **THEN** the React adapter throws a clear error identifying the unregistered `viewId`

#### Scenario: A primitive node never triggers a registry lookup

- **WHEN** a primitive node's `kind` string coincidentally matches a key in the configured view registry
- **THEN** the React adapter still renders it as a primitive DOM element, since only a view node's `viewId` is consulted
