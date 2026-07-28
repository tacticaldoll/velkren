## MODIFIED Requirements

### Requirement: Reactive mount and commit through the port

The adapter SHALL mount a render plan onto a real DOM surface using SolidJS reactivity, driven only through the `RendererPort` operations. It SHALL own a per-root container element (`rootContainer`, distinct from the shared-host `container` option) into which it renders the root content, and it MUST apply the runtime-assigned permanent identity attribute on that container at creation and re-apply it on every commit, repairing it if lost, without deriving identity or ownership from the DOM.

A commit SHALL reconcile the projected content in place rather than rebuilding it. A primitive element (one the adapter creates itself via `document.createElement`, i.e. not a registered view) whose `kind` is unchanged across a commit MUST keep its existing DOM node; the adapter MUST apply only the changed attributes to that node, remove attributes absent from the new node, and reconcile its children in place — adding or removing child elements only where the child list changed and leaving unchanged sibling elements untouched. The adapter MUST NOT destroy and recreate an unchanged primitive element on commit. When a children array is fully keyed (every child carries a non-blank `key`) or the corresponding prior children array was fully keyed, the adapter MUST reconcile that array by key rather than position: a child whose key is reused across the commit MUST keep its existing DOM element (patched in place, or rebuilt only if its own kind/variant changed); a new key MUST get a freshly built element; and — since the prior array is not guaranteed to have been fully keyed itself (a caller committing a `RenderNode` directly, bypassing template-authoring validation, may transition a children array between not-fully-keyed and fully-keyed across a commit) — every DOM child element not reused by a matched key MUST be removed, not only elements that were previously keyed. A children array that is not fully keyed on either side continues to reconcile by position exactly as before — index-based reconciliation, where a node's position among its siblings identifies it, remains the default and is only superseded when at least one side carries a full set of keys. A registered view remains a self-contained leaf and MAY be re-instantiated on commit, since it receives the node's `props` as plain props.

#### Scenario: Mount projects a plan to the DOM

- **WHEN** the runtime projects a component instance's render plan through the adapter
- **THEN** each root's per-root container is created on the DOM surface carrying its runtime-assigned identity attribute, with the rendered content inside it

#### Scenario: Commit repairs identity

- **WHEN** a root's identity attribute is removed from its container and the root is committed again
- **THEN** the adapter restores the runtime-assigned identity attribute on the container while updating content

#### Scenario: Commit preserves an unchanged primitive element

- **WHEN** a root is committed again with a same-shape node whose only difference is a changed attribute on a primitive element
- **THEN** that element is the same DOM node as before the commit, with the changed attribute applied, rather than a newly created element

#### Scenario: Commit applies attribute and structural changes in place

- **WHEN** a root is committed with a node that changes a primitive element's attributes, drops one of its attributes, and adds and removes a child
- **THEN** the adapter updates and removes attributes on the existing element, adds and removes only the affected child elements, and leaves the unchanged sibling elements in place as the same DOM nodes

#### Scenario: A keyed list reorders without losing element identity

- **WHEN** a fully-keyed children array is committed again with the same keys in a different order
- **THEN** each key's DOM element is the same node as before the commit, now in the new order, with no element destroyed and recreated solely due to the reorder

#### Scenario: A keyed list inserts and removes by key

- **WHEN** a fully-keyed children array is committed again with one key removed and a new key inserted
- **THEN** the removed key's element is removed, a fresh element is built for the new key, and every other key's element is unaffected

#### Scenario: A children array transitioning from unkeyed to keyed leaks no elements

- **WHEN** a children array with no keys is committed again as a fully-keyed array covering the same number of positions
- **THEN** every prior unkeyed element is removed and a fresh element is built for each new key, with no stale element left behind

#### Scenario: An unkeyed list is unaffected

- **WHEN** a children array with no `key` on any child is committed again in a different order
- **THEN** reconciliation proceeds by position exactly as before this requirement, with no keyed-reconciliation behavior applied
