## MODIFIED Requirements

### Requirement: Solid adapter implements child mounting

The adapter SHALL implement the `RendererPort` child-mounting operation by creating a new per-root container anchored under the DOM element registered for the given anchor name, reusing the same container/identity/interaction-listener setup as a top-level root. A registered Solid view SHALL receive a second call argument alongside its props: a context object exposing `registerAnchor(name, element)`, which the adapter records against the root currently being rendered, so a later child-mounting call naming that anchor resolves to the registered element. A primitive node whose resolved `RenderNode.slots` has exactly one entry SHALL also register its own rendered element as an anchor under that slot's name, using the same `anchors` map, on both the initial build path and the same-`kind` patch-in-place path; a primitive node with zero or two-or-more resolved slots registers no anchor.

When a commit causes the registered element for an anchor name to be replaced (for example, because a registered view is re-instantiated, or a single-slot primitive is rebuilt), the adapter MUST reconcile any child currently mounted at that anchor rather than silently discarding it: if the anchor name is still exposed after the commit, the child's own container MUST be moved under the newly-registered element, unchanged and undisposed; if the anchor name is no longer exposed at all, the child MUST be released through the same disposal path as an explicit `removeRoot` call, and the loss MUST be reported through the adapter's failure-reporting convention rather than left silent.

#### Scenario: A view registers an anchor and hosts a child

- **WHEN** a Solid view calls `registerAnchor` with a name and an element during its own render, and a caller later calls `mountChild` naming that anchor on the same root
- **THEN** the child's per-root container is created under the registered element, with its own identity attribute and native interaction listener

#### Scenario: An unmodified view is unaffected

- **WHEN** a registered Solid view never calls `registerAnchor`
- **THEN** it renders exactly as it did before this requirement, receiving only its props

#### Scenario: A commit that replaces an anchor's element preserves its mounted child

- **WHEN** a child is mounted at a named anchor and a later commit causes the view exposing that anchor to register a new element under the same name
- **THEN** the child's own container is moved under the new element with no disposal, no rebuild, and no interruption to its identity or interaction listeners

#### Scenario: A commit that stops exposing an anchor releases its mounted child

- **WHEN** a child is mounted at a named anchor and a later commit causes the view to stop registering that anchor name at all
- **THEN** the child is released through the same path as an explicit `removeRoot` call, and the loss is reported through the adapter's failure-reporting convention rather than silently discarded

#### Scenario: A primitive node with exactly one resolved slot becomes its own anchor

- **WHEN** a primitive `RenderNode` is rendered whose resolved `.slots` record has exactly one entry named `"body"`, and a caller later calls `mountChild` naming `"body"` on the same root
- **THEN** the child's per-root container is created under that primitive node's own rendered element, with its own identity attribute and native interaction listener

#### Scenario: A patched-in-place node's slot registration follows its fill status

- **WHEN** a primitive node with no resolved slots is patched in place (same `kind`, no rebuild) by a later commit whose resolved `.slots` now has exactly one entry
- **THEN** the node's element is registered as an anchor under that slot's name after the patch, without requiring the node to be torn down and rebuilt

#### Scenario: A node with zero or multiple resolved slots registers no anchor

- **WHEN** a primitive node is rendered with either no resolved slots or two-or-more resolved slots
- **THEN** the adapter registers no anchor for that node, and its rendering is otherwise unaffected by this requirement

#### Scenario: A renamed sole slot on a patch-in-place commit un-registers the old name

- **WHEN** a primitive node's sole resolved slot is named `"a"` on one commit and, on a later commit
  that patches the same element in place (no rebuild), is named `"b"` instead
- **THEN** a subsequent `mountChild` call naming `"a"` throws (no anchor registered under that name),
  while a `mountChild` call naming `"b"` succeeds, targeting the same element

#### Scenario: A removed sole slot on a patch-in-place commit un-registers the anchor

- **WHEN** a primitive node has a sole resolved slot named `"a"` on one commit and, on a later commit
  that patches the same element in place (no rebuild), has no resolved slots at all
- **THEN** a subsequent `mountChild` call naming `"a"` throws (no anchor registered under that name)
