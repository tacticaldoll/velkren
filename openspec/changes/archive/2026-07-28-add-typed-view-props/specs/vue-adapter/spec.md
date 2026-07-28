## MODIFIED Requirements

### Requirement: Vue view registry

The Vue adapter SHALL accept an optional view registry mapping a `viewId` to a
native Vue view, consulted for every node including the root, but only for a
**view node** (a node carrying `node: "view"`); a primitive node (carrying `kind`)
MUST NOT trigger a registry lookup and always renders via `h(kind, …)`, unchanged.
On a hit it SHALL render the registered view with the view node's `props` as its
props. A view node has no tag name to fall back to, so the Vue adapter MUST throw
a clear error identifying the unregistered `viewId` when a view node's `viewId` is
not registered, including when no registry is configured. `@velkren/core` MUST NOT
reference the view type or the registry.

#### Scenario: A registered view renders with props as props

- **WHEN** a Vue renderer is configured with a view registered under a `viewId` and a view node with that `viewId` is projected
- **THEN** the registered view renders with the node's `props` as its props

#### Scenario: Vue adapter throws on an unregistered viewId

- **WHEN** a view node's `viewId` is not in the registry (or no registry is configured)
- **THEN** the Vue adapter throws a clear error identifying the unregistered `viewId`

#### Scenario: A primitive node never triggers a registry lookup

- **WHEN** a primitive node's `kind` string coincidentally matches a key in the configured view registry
- **THEN** the Vue adapter still renders it via `h(kind, …)`, since only a view node's `viewId` is consulted
