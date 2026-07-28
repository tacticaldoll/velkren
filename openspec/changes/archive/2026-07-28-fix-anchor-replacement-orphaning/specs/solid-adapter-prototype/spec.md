## MODIFIED Requirements

### Requirement: Solid adapter implements child mounting

The adapter SHALL implement the `RendererPort` child-mounting operation by creating a new per-root container anchored under the DOM element registered for the given anchor name, reusing the same container/identity/interaction-listener setup as a top-level root. A registered Solid view SHALL receive a second call argument alongside its props: a context object exposing `registerAnchor(name, element)`, which the adapter records against the root currently being rendered, so a later child-mounting call naming that anchor resolves to the registered element.

When a commit causes the registered element for an anchor name to be replaced (for example, because a registered view is re-instantiated), the adapter MUST reconcile any child currently mounted at that anchor rather than silently discarding it: if the anchor name is still exposed after the commit, the child's own container MUST be moved under the newly-registered element, unchanged and undisposed; if the anchor name is no longer exposed at all, the child MUST be released through the same disposal path as an explicit `removeRoot` call, and the loss MUST be reported through the adapter's failure-reporting convention rather than left silent.

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
