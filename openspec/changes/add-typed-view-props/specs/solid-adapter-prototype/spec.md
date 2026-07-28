## MODIFIED Requirements

### Requirement: SolidJS adapter view registry

The SolidJS adapter SHALL accept an optional view registry and consult it — for the root node and children alike — only for a **view node** (a node carrying `node: "view"`), keyed by that node's `viewId`; a primitive node (carrying `kind`) MUST NOT trigger a registry lookup and always renders via `document.createElement(kind)`, unchanged. On a hit the adapter renders the registered Solid view within the root's reactive owner (so its effects dispose on unmount), passing the view node's `props` as its props. A view node has no tag name to fall back to, so the Solid adapter MUST throw a clear error identifying the unregistered `viewId` when a view node's `viewId` is not registered (including when no registry is configured). The registry and Solid view types MUST remain in the adapter package; `@velkren/core` MUST NOT reference them.

#### Scenario: Solid adapter renders a registered view

- **WHEN** the Solid adapter is configured with a Solid view under a `viewId` and projects a view node with that `viewId` (root or child)
- **THEN** it renders the registered Solid view for that node with the node's `props` as props

#### Scenario: Solid adapter throws on an unregistered viewId

- **WHEN** a view node's `viewId` is not registered (or no registry is configured)
- **THEN** the Solid adapter throws a clear error identifying the unregistered `viewId`

#### Scenario: A primitive node never triggers a registry lookup

- **WHEN** a primitive node's `kind` string coincidentally matches a key in the configured view registry
- **THEN** the Solid adapter still renders it as a primitive DOM element, since only a view node's `viewId` is consulted
