## MODIFIED Requirements

### Requirement: Reactive mount and commit through the port

The adapter SHALL mount a render plan onto a real DOM surface using SolidJS reactivity, driven only through the `RendererPort` operations. It SHALL own a per-root container element (`rootContainer`, distinct from the shared-host `container` option) into which it renders the root content, and it MUST apply the runtime-assigned permanent identity attribute on that container at creation and re-apply it on every commit, repairing it if lost, without deriving identity or ownership from the DOM.

A commit SHALL reconcile the projected content in place rather than rebuilding it. A primitive element (one the adapter creates itself via `document.createElement`, i.e. not a registered view) whose `kind` is unchanged across a commit MUST keep its existing DOM node; the adapter MUST apply only the changed attributes to that node, remove attributes absent from the new node, and reconcile its children in place — adding or removing child elements only where the child list changed and leaving unchanged sibling elements untouched. The adapter MUST NOT destroy and recreate an unchanged primitive element on commit. Reconciliation MAY be index-based (a node's position among its siblings identifies it); stable-key reconciliation for reordering collections is out of scope for this requirement. A registered view remains a self-contained leaf and MAY be re-instantiated on commit, since it receives the node's attributes as plain props.

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
