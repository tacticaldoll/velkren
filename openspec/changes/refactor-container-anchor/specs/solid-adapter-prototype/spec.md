## MODIFIED Requirements

### Requirement: Reactive mount and commit through the port

The adapter SHALL mount a render plan onto a real DOM surface using SolidJS reactivity, driven only through the `RendererPort` operations. It SHALL own a per-root container element (`rootContainer`, distinct from the shared-host `container` option) into which it renders the root content, and it MUST apply the runtime-assigned permanent identity attribute on that container at creation and re-apply it on every commit, repairing it if lost, without deriving identity or ownership from the DOM.

#### Scenario: Mount projects a plan to the DOM

- **WHEN** the runtime projects a component instance's render plan through the adapter
- **THEN** each root's per-root container is created on the DOM surface carrying its runtime-assigned identity attribute, with the rendered content inside it

#### Scenario: Commit repairs identity

- **WHEN** a root's identity attribute is removed from its container and the root is committed again
- **THEN** the adapter restores the runtime-assigned identity attribute on the container while updating content

### Requirement: Native input snapshot boundary

Native DOM input and events observed by the adapter MUST be captured through a native listener the adapter attaches to its per-root container and converted to immutable snapshots at the adapter boundary, satisfying the port's interaction-registration operation. The adapter MUST NOT require application code to attach an external listener to a queried surface element. Live DOM nodes, native event objects, and renderer-native reactive values MUST NOT cross into the runtime; only immutable snapshot data does.

#### Scenario: Native event becomes an immutable snapshot

- **WHEN** an interaction occurs on an element inside a root's container for which core registered interaction interest
- **THEN** the container's listener produces an immutable snapshot, invokes the registered delivery callback, and never passes the live DOM node or native event object into the runtime

#### Scenario: No external listener required

- **WHEN** core registers interaction interest on a mounted root through the port
- **THEN** the adapter wires capture through its own container listener, without the application selecting the surface element or attaching a listener itself
