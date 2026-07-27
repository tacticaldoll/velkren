## ADDED Requirements

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
