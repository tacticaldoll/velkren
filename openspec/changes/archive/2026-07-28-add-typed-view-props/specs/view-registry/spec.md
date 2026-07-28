## MODIFIED Requirements

### Requirement: Adapter view registry applying to any node

A `RendererPort` adapter SHALL accept an optional view registry: a map from a `viewId` string to a framework-native view. When rendering a `RenderNode` — including the projection root, since the runtime's identity and interaction anchor live on the per-root container rather than the rendered element — the adapter SHALL consult the registry only for a **view node** (a node carrying `node: "view"`), keyed by that node's `viewId`; a **primitive node** (a node carrying `kind`) MUST NOT trigger a registry lookup, even if its `kind` string happens to match a registered `viewId`, and instead always renders via its existing primitive path (`createElement(kind)`), exactly as before this requirement. A view node has no tag name of its own to fall back to, so the adapter MUST throw a clear error identifying the unregistered `viewId` when a view node's `viewId` is not in the registry, including when no registry is configured at all. `@velkren/core` MUST NOT reference the view type or the registry — the registry is constructed and consumed entirely within the adapter, and core continues to emit only neutral render nodes.

#### Scenario: A registered view renders, including at the root

- **WHEN** an adapter is configured with a view registered under a `viewId` and a view node with that `viewId` is projected — whether it is the root node or a child node
- **THEN** the adapter renders the registered framework-native view for that node

#### Scenario: A primitive node never triggers a registry lookup

- **WHEN** a primitive node's `kind` string coincidentally matches a key in the configured view registry
- **THEN** the adapter still renders it via its primitive path, since only a view node's `viewId` is consulted against the registry

#### Scenario: An unregistered viewId is an explicit error

- **WHEN** a view node's `viewId` is not in the registry (or no registry is configured)
- **THEN** the adapter throws a clear error identifying the unregistered `viewId`, since a view node has no tag name to fall back to

#### Scenario: Core stays framework-neutral

- **WHEN** the adapter resolves a view node's `viewId` to a registered framework-native view
- **THEN** `@velkren/core` neither references the view type nor the registry, and still emits only neutral render nodes

### Requirement: Neutral props channel to a registered leaf view

A registered view SHALL receive the view node's `props` (a neutral `JsonObject`) as its props; no framework-native reactive object or live node SHALL be passed from core, and a view's props are never derived from a primitive node's `attributes`. A registered view SHALL be a self-contained leaf by default: since a view node carries no `children` or `slots` fields, the adapter has nothing of the node's own to project into it. A registered view MAY opt into hosting a managed child projection by registering one or more named anchors through an adapter-provided mechanism shaped to the adapter's own component-invocation model; an anchor is inert until an explicit `mountChild` call targets it by name, and a view that never registers an anchor behaves exactly as a strict leaf, unchanged from before this requirement.

#### Scenario: A view receives node props as props

- **WHEN** a registered view renders for a view node carrying `props`
- **THEN** the view receives those `props` as its props, and no non-neutral value is passed from core

#### Scenario: A registered view renders as a leaf by default

- **WHEN** a registered view renders for a view node and the view registers no anchor
- **THEN** the adapter renders only the registered view, with nothing else to project since the node carries no children or slots

#### Scenario: A registered root view emits an interaction through the port

- **WHEN** a component's root node is a registered view rendering a DOM element, an interaction is registered on the root, and the interaction occurs on that element
- **THEN** the event bubbles to the container's listener and the adapter delivers the interaction snapshot through the port, exactly as for a primitive root

#### Scenario: An anchor is inert until targeted

- **WHEN** a registered view registers a named anchor and no `mountChild` call ever targets that name
- **THEN** the anchor element renders empty, with no managed content projected into it and no error raised

#### Scenario: A registered view hosts a managed child projection

- **WHEN** a registered view registers a named anchor and a caller mounts a child component instance's projection at that anchor through `mountChild`
- **THEN** the child's rendered content appears inside the anchor element, with its own identity, interaction capture, and lifecycle fully isolated from the parent view's own node
