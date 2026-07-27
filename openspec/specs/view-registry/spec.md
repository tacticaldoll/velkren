# view-registry Specification

## Purpose

TBD - created by archiving change add-view-registry. Update Purpose after archive.

## Requirements

### Requirement: Adapter view registry applying to any node

A `RendererPort` adapter SHALL accept an optional view registry: a map from a node `kind` string to a framework-native view. When rendering a `RenderNode` — including the projection root, since the runtime's identity and interaction anchor live on the per-root container rather than the rendered element — the adapter SHALL consult the registry by `kind` first; on a hit it SHALL render the registered view, and on a miss it SHALL fall back to its existing primitive rendering (`createElement(kind)`). The registry SHALL be optional so that with no registry configured the adapter renders exactly as before. `@velkren/core` MUST NOT reference the view type or the registry — the registry is constructed and consumed entirely within the adapter, and core continues to emit only neutral render nodes.

#### Scenario: A registered view renders, including at the root

- **WHEN** an adapter is configured with a view registered under a `kind` and a node with that `kind` is projected — whether it is the root node or a child node
- **THEN** the adapter renders the registered framework-native view for that node

#### Scenario: Unregistered kind falls back to the primitive path

- **WHEN** a render node's `kind` is not in the registry (or no registry is configured)
- **THEN** the adapter renders it via its existing primitive path, unchanged

#### Scenario: Core stays framework-neutral

- **WHEN** the adapter resolves a node kind to a registered framework-native view
- **THEN** `@velkren/core` neither references the view type nor the registry, and still emits only neutral render nodes

### Requirement: Neutral props channel to a registered leaf view

A registered view SHALL receive the render node's `attributes` (a neutral `JsonObject`) as its props; no framework-native reactive object or live node SHALL be passed from core. A registered view SHALL be a self-contained leaf by default: the adapter does not render the node's Velkren-managed children or slots into it, and it does not auto-project them regardless of whether the view registers an anchor. A registered view MAY opt into hosting a managed child projection by registering one or more named anchors through an adapter-provided mechanism shaped to the adapter's own component-invocation model; an anchor is inert until an explicit `mountChild` call targets it by name, and a view that never registers an anchor behaves exactly as a strict leaf, unchanged from before this requirement.

#### Scenario: A view receives node attributes as props

- **WHEN** a registered view renders for a node carrying attributes
- **THEN** the view receives those attributes as its props, and no non-neutral value is passed from core

#### Scenario: A registered view renders as a leaf by default

- **WHEN** a registered view renders for a node that carries Velkren-managed children or slots and the view registers no anchor
- **THEN** the adapter renders only the registered view and does not project the node's children or slots into it

#### Scenario: A registered root view emits an interaction through the port

- **WHEN** a component's root node is a registered view rendering a DOM element, an interaction is registered on the root, and the interaction occurs on that element
- **THEN** the event bubbles to the container's listener and the adapter delivers the interaction snapshot through the port, exactly as for a primitive root

#### Scenario: An anchor is inert until targeted

- **WHEN** a registered view registers a named anchor and no `mountChild` call ever targets that name
- **THEN** the anchor element renders empty, with no managed content projected into it and no error raised

#### Scenario: A registered view hosts a managed child projection

- **WHEN** a registered view registers a named anchor and a caller mounts a child component instance's projection at that anchor through `mountChild`
- **THEN** the child's rendered content appears inside the anchor element, with its own identity, interaction capture, and lifecycle fully isolated from the parent view's own node
