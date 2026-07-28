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

The adapter SHALL implement the `RendererPort` child-mounting operation by creating a new per-root container anchored under the DOM element registered for the given anchor name, reusing the same container/identity/interaction-listener setup as a top-level root. The adapter SHALL expose a `registerAnchor(name, element)` function to a registered view through Vue's `provide`/`inject` (`REGISTER_ANCHOR_KEY`), not through the view's props, so that `VueView`'s prop type remains exactly `FunctionalComponent<JsonObject>`, unchanged from before this requirement. Calling `registerAnchor` records the element against the root currently being rendered, so a later child-mounting call naming that anchor resolves to the registered element. A primitive node whose resolved `RenderNode.slots` has exactly one entry SHALL also register its own rendered element as an anchor under that slot's name, via `onVnodeMounted`/`onVnodeUpdated` vnode lifecycle hooks on that element (not a `ref`, since Vue does not reliably re-invoke a changed `ref` callback for an element reused across a patch); a primitive node with zero or two-or-more resolved slots registers no anchor. When a node's sole resolved slot's name changes, or its slot is removed entirely, between one commit and the next while the same DOM element persists (no rebuild), the adapter MUST remove the old name's `anchors` entry so a later `mountChild` call cannot resolve a name that no longer reflects the node's current slot.

When a commit causes the registered element for an anchor name to be replaced (for example, because Vue's own patch decides to remount the host node backing that anchor), the adapter MUST reconcile any child currently mounted at that anchor rather than silently discarding it: if the anchor name is still exposed after the commit, the child's own container MUST be moved under the newly-registered element, unchanged and undisposed; if the anchor name is no longer exposed at all, the child MUST be released through the same disposal path as an explicit `removeRoot` call, and the loss MUST be reported through the adapter's failure-reporting convention rather than left silent.

#### Scenario: A view registers an anchor and hosts a child

- **WHEN** a Vue view reads `registerAnchor` via `inject(REGISTER_ANCHOR_KEY)` and calls it with a name and an element (typically from a `ref`, since a real DOM element only exists at commit), and a caller later calls `mountChild` naming that anchor on the same root
- **THEN** the child's per-root container is created under the registered element, with its own identity attribute and native interaction listener, as an independent Vue render root rather than a `Teleport` into the parent's own tree

#### Scenario: An unmodified view is unaffected

- **WHEN** a registered Vue view never injects `REGISTER_ANCHOR_KEY`
- **THEN** it renders exactly as it did before this requirement, receiving only its attribute-derived props, and its declared prop type is unaffected by this requirement

#### Scenario: A commit that replaces an anchor's element preserves its mounted child

- **WHEN** a child is mounted at a named anchor and a later commit causes Vue's patch to register a new element for that same anchor name
- **THEN** the child's own container is moved under the new element with no disposal, no rebuild, and no interruption to its identity or interaction listeners

#### Scenario: A commit that stops exposing an anchor releases its mounted child

- **WHEN** a child is mounted at a named anchor and a later commit causes the view to stop registering that anchor name at all
- **THEN** the child is released through the same path as an explicit `removeRoot` call, and the loss is reported through the adapter's failure-reporting convention rather than silently discarded

#### Scenario: A primitive node with exactly one resolved slot becomes its own anchor

- **WHEN** a primitive `RenderNode` is rendered whose resolved `.slots` record has exactly one entry named `"body"`, and a caller later calls `mountChild` naming `"body"` on the same root
- **THEN** the child's per-root container is created under that primitive node's own rendered element, with its own identity attribute and native interaction listener

#### Scenario: A node with zero or multiple resolved slots registers no anchor

- **WHEN** a primitive node is rendered with either no resolved slots or two-or-more resolved slots
- **THEN** the adapter registers no anchor for that node, and its rendering is otherwise unaffected by this requirement

#### Scenario: A renamed sole slot on a re-render un-registers the old name

- **WHEN** a primitive node's sole resolved slot is named `"a"` on one render and, on a later re-render
  of the same element (no key change), is named `"b"` instead
- **THEN** a subsequent `mountChild` call naming `"a"` throws (no anchor registered under that name),
  while a `mountChild` call naming `"b"` succeeds, targeting the same element

#### Scenario: A removed sole slot on a re-render un-registers the anchor

- **WHEN** a primitive node has a sole resolved slot named `"a"` on one render and, on a later re-render
  of the same element (no key change), has no resolved slots at all
- **THEN** a subsequent `mountChild` call naming `"a"` throws (no anchor registered under that name)

### Requirement: Interaction isolation between a nested child and its parent

A container's interaction listener SHALL ignore an event whose nearest ancestor carrying the projection identity attribute is not that container itself, so an interaction inside a child root mounted via `mountChild` is not also delivered to the parent root's own listener.

#### Scenario: An interaction inside a nested child does not reach the parent's listener

- **WHEN** a child projection is mounted via `mountChild` inside a parent root's anchor, and an interaction occurs on an element inside the child's own container
- **THEN** only the child root's interaction listener processes the event; the parent root's listener, upon seeing the bubbled event, finds the child's container as the nearest identity-bearing ancestor and does not process it

### Requirement: Keyed child reconciliation via Vue's own reconciler

When a node's children array is fully keyed (every child carries a non-blank `key`), the adapter SHALL use each child's own `key` as its Vue vnode key. When the array is not fully keyed — including today's fully-unkeyed lists, and a mixed list only reachable by committing a `RenderNode` directly rather than through template authoring — every child SHALL use its positional index instead, never mixing a real key with a synthesized one. The adapter MUST NOT implement its own child-reconciliation algorithm for this: passing the real key into the vnode tree when the list is fully keyed is sufficient for Vue's existing `render`/patch reconciler to preserve a keyed child's DOM element across an insert, remove, or reorder on a subsequent commit.

#### Scenario: A keyed list reorders without losing element identity

- **WHEN** a children array where every child carries a `key` is committed again with the same keys in a different order
- **THEN** each key's DOM element is the same node as before the commit, now in the new order

#### Scenario: An unkeyed list is unaffected

- **WHEN** a children array with no `key` on any child is committed again in a different order
- **THEN** reconciliation proceeds by positional index exactly as before this requirement

#### Scenario: A partially-keyed list still renders every child

- **WHEN** a children array where only some children carry a `key` is committed (reachable only by committing a `RenderNode` directly, since template authoring rejects this shape)
- **THEN** every child still renders, reconciled by positional index rather than mixing a real key with a synthesized one
