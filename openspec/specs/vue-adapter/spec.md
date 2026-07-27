# Vue Adapter

## Purpose

Define `@velkren/vue-adapter`: a Vue `RendererPort` implementation driven by Vue's
imperative renderer (`render` / `h`), and a Vue membrane bound to the shared
`@velkren/element` core. A third rendering model — distinct from Solid's signals and
React's reconciler — hardens the renderer-independence claim: the port is not shaped
around the two frameworks it was first written against. The adapter carries the same
per-root container anchor (identity + native interaction listener), commit repair, view
registry, and immutable interaction snapshots as the other adapters, and passes the
shared neutral composition's validation with no Vue dev warnings. Vue and DOM types live only in
this package; `@velkren/core` imports no Vue type.

## Requirements

### Requirement: Vue renderer implements the RendererPort

`@velkren/vue-adapter` SHALL provide `createVueRenderer` implementing the core
`RendererPort` by projecting renderer-neutral render nodes through Vue's imperative
renderer (`render` / `h`). It SHALL project a render node on `createRoot`, patch it on
`commit`, read identity, and unmount deterministically on `removeRoot`. Vue and DOM
types SHALL live only in this package; `@velkren/core` MUST NOT import any Vue type.

#### Scenario: The Vue renderer satisfies the port

- **WHEN** a projection runtime is created with `createVueRenderer()`
- **THEN** the renderer satisfies the `RendererPort` operations, and core imports no Vue type

#### Scenario: Commit patches and unmount is deterministic

- **WHEN** a root is committed with a new plan and later removed
- **THEN** the surface reflects the new plan after the commit, and removal unmounts the Vue tree and detaches the container

### Requirement: The native renderer already satisfies value-crossing

The adapter SHALL rely on Vue's own `render()`/`patchProp` pipeline to apply
a `value` attribute to a form element as a live DOM property with
skip-if-equal semantics, requiring no adapter-specific code. The adapter
MUST NOT add a parallel value-handling mechanism alongside Vue's own.

#### Scenario: A same-value re-commit does not disturb the field

- **WHEN** a primitive `input` node carries a `value` attribute equal to the
  element's current `.value` property and a commit re-renders it through
  the Vue adapter
- **THEN** the element's `.value` property is not reassigned and the user's
  caret position is unaffected

#### Scenario: A different value updates the live property

- **WHEN** a commit's `value` attribute differs from the element's current
  `.value` property
- **THEN** Vue's own renderer assigns the new value to the DOM property,
  and the adapter's code performs no additional handling

### Requirement: Per-root container anchor with commit repair

Each Vue root SHALL own a per-root container carrying a runtime-assigned identity
attribute and the interaction listener. Identity SHALL be stamped imperatively on the
container (never through a vnode), so a commit repairs an out-of-band-removed identity
attribute. Interaction capture SHALL be one native listener per type on the container,
reading a registration map at event time so registration needs no re-render.

#### Scenario: Commit repairs a removed identity attribute

- **WHEN** the identity attribute is removed from a Vue root's container and the root is committed again
- **THEN** the commit restores the runtime-assigned identity attribute without changing the token

#### Scenario: An interaction delivers an immutable snapshot

- **WHEN** an interaction of a registered type occurs inside a Vue root's container
- **THEN** the adapter delivers an immutable snapshot through the port and never passes a live node or native event inward

### Requirement: Vue view registry

The Vue adapter SHALL accept an optional view registry mapping a node `kind` to a
native Vue view, consulted for every node including the root. On a hit it SHALL render
the registered view with the node's attributes as props; on a miss it SHALL fall back
to the primitive path (`h(kind, …)`). `@velkren/core` MUST NOT reference the view type
or the registry.

#### Scenario: A registered view renders with attributes as props

- **WHEN** a Vue renderer is configured with a view registered under a `kind` and a node with that `kind` is projected
- **THEN** the registered view renders with the node's attributes as its props

#### Scenario: An unregistered kind falls back to the primitive path

- **WHEN** a node's `kind` is not in the registry
- **THEN** the adapter renders it via `h(kind, …)`, unchanged

### Requirement: Vue neutral-composition validation

The Vue adapter SHALL pass the shared neutral composition's validation
(`createEditorApp(createVueRenderer())`) — two editors coexist without collision, a
business event is observed through the event trace, and destroying one editor releases
only its owned work — with no `@velkren/core` change and no Vue dev warning.

#### Scenario: Two editors isolate, emit, and dispose on Vue

- **WHEN** the shared neutral composition is mounted on the Vue renderer, both editors are interacted with, and one is destroyed
- **THEN** the two never collide, each business event is observed through the trace, destroying one releases only its work, and no Vue dev warning is emitted

### Requirement: Vue membrane via the shared core

The Vue adapter SHALL expose a `defineVelkrenElement` that binds the shared
`@velkren/element` membrane core to `createVueRenderer`, reproducing the membrane
guarantees on Vue with no membrane-specific reimplementation.

#### Scenario: A Vue membrane mounts and disposes through the boundary

- **WHEN** a membrane is defined through the Vue adapter, placed, interacted with, and destroyed
- **THEN** it mounts a Vue composition, captures the interaction, relays the outward event, and disposes scope-locally through the element boundary

### Requirement: Vue adapter implements child mounting

The adapter SHALL implement the `RendererPort` child-mounting operation by creating a new per-root container anchored under the DOM element registered for the given anchor name, reusing the same container/identity/interaction-listener setup as a top-level root. The adapter SHALL expose a `registerAnchor(name, element)` function to a registered view through Vue's `provide`/`inject` (`REGISTER_ANCHOR_KEY`), not through the view's props, so that `VueView`'s prop type remains exactly `FunctionalComponent<JsonObject>`, unchanged from before this requirement. Calling `registerAnchor` records the element against the root currently being rendered, so a later child-mounting call naming that anchor resolves to the registered element.

#### Scenario: A view registers an anchor and hosts a child

- **WHEN** a Vue view reads `registerAnchor` via `inject(REGISTER_ANCHOR_KEY)` and calls it with a name and an element (typically from a `ref`, since a real DOM element only exists at commit), and a caller later calls `mountChild` naming that anchor on the same root
- **THEN** the child's per-root container is created under the registered element, with its own identity attribute and native interaction listener, as an independent Vue render root rather than a `Teleport` into the parent's own tree

#### Scenario: An unmodified view is unaffected

- **WHEN** a registered Vue view never injects `REGISTER_ANCHOR_KEY`
- **THEN** it renders exactly as it did before this requirement, receiving only its attribute-derived props, and its declared prop type is unaffected by this requirement

### Requirement: Interaction isolation between a nested child and its parent

A container's interaction listener SHALL ignore an event whose nearest ancestor carrying the projection identity attribute is not that container itself, so an interaction inside a child root mounted via `mountChild` is not also delivered to the parent root's own listener.

#### Scenario: An interaction inside a nested child does not reach the parent's listener

- **WHEN** a child projection is mounted via `mountChild` inside a parent root's anchor, and an interaction occurs on an element inside the child's own container
- **THEN** only the child root's interaction listener processes the event; the parent root's listener, upon seeing the bubbled event, finds the child's container as the nearest identity-bearing ancestor and does not process it
