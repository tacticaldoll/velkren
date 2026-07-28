## MODIFIED Requirements

### Requirement: Vue adapter implements child mounting

The adapter SHALL implement the `RendererPort` child-mounting operation by creating a new per-root container anchored under the DOM element registered for the given anchor name, reusing the same container/identity/interaction-listener setup as a top-level root. The adapter SHALL expose a `registerAnchor(name, element)` function to a registered view through Vue's `provide`/`inject` (`REGISTER_ANCHOR_KEY`), not through the view's props, so that `VueView`'s prop type remains exactly `FunctionalComponent<JsonObject>`, unchanged from before this requirement. Calling `registerAnchor` records the element against the root currently being rendered, so a later child-mounting call naming that anchor resolves to the registered element. A primitive node whose resolved `RenderNode.slots` has exactly one entry SHALL also register its own rendered element as an anchor under that slot's name, via a `ref` prop on that element; a primitive node with zero or two-or-more resolved slots registers no anchor. When a node's sole resolved slot's name changes, or its slot is removed entirely, between one commit and the next while the same DOM element persists (no rebuild), the adapter MUST remove the old name's `anchors` entry so a later `mountChild` call cannot resolve a name that no longer reflects the node's current slot.

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

#### Scenario: A renamed or removed sole slot on a re-render un-registers the old name

- **WHEN** a primitive node's sole resolved slot is named `"a"` on one render and, on a later re-render
  of the same element (no key change), is either named `"b"` instead or removed entirely
- **THEN** a subsequent `mountChild` call naming `"a"` throws (no anchor registered under that name)
