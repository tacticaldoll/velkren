## MODIFIED Requirements

### Requirement: React adapter implements child mounting

The adapter SHALL implement the `RendererPort` child-mounting operation by creating a new per-root container anchored under the DOM element registered for the given anchor name, reusing the same container/identity/interaction-listener setup as a top-level root. The adapter SHALL expose a `registerAnchor(name, element)` function to a registered view through React context (`RegisterAnchorContext`), not through the view's props, so that `ReactView`'s prop type remains exactly `FunctionComponent<JsonObject>`, unchanged from before this requirement. Calling `registerAnchor` records the element against the root currently being rendered, so a later child-mounting call naming that anchor resolves to the registered element.

When a commit causes the registered element for an anchor name to be replaced (for example, because React's own reconciler decides to remount the host node backing that anchor), the adapter MUST reconcile any child currently mounted at that anchor rather than silently discarding it: if the anchor name is still exposed after the commit, the child's own container MUST be moved under the newly-registered element, unchanged and undisposed; if the anchor name is no longer exposed at all, the child MUST be released through the same disposal path as an explicit `removeRoot` call, and the loss MUST be reported through the adapter's failure-reporting convention rather than left silent.

#### Scenario: A view registers an anchor and hosts a child

- **WHEN** a React view reads `registerAnchor` via `useContext(RegisterAnchorContext)` and calls it with a name and an element (typically from a `ref` callback, since a real DOM element only exists at commit), and a caller later calls `mountChild` naming that anchor on the same root
- **THEN** the child's per-root container is created under the registered element, with its own identity attribute and native interaction listener, as an independent React root rather than a portal into the parent's own tree

#### Scenario: An unmodified view is unaffected

- **WHEN** a registered React view never reads `RegisterAnchorContext`
- **THEN** it renders exactly as it did before this requirement, receiving only its attribute-derived props, and its declared prop type is unaffected by this requirement

#### Scenario: A commit that replaces an anchor's element preserves its mounted child

- **WHEN** a child is mounted at a named anchor and a later commit causes React's reconciler to register a new element for that same anchor name
- **THEN** the child's own container is moved under the new element with no disposal, no rebuild, and no interruption to its identity or interaction listeners

#### Scenario: A commit that stops exposing an anchor releases its mounted child

- **WHEN** a child is mounted at a named anchor and a later commit causes the view to stop registering that anchor name at all
- **THEN** the child is released through the same path as an explicit `removeRoot` call, and the loss is reported through the adapter's failure-reporting convention rather than silently discarded
