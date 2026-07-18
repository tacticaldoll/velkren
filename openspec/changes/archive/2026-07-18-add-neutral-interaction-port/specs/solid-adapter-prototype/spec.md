## MODIFIED Requirements

### Requirement: Native input snapshot boundary

Native DOM input and events observed by the adapter MUST be captured through the adapter's own SolidJS event layer and converted to immutable snapshots at the adapter boundary, satisfying the port's interaction-registration operation. The adapter MUST NOT require application code to attach an external native listener to a queried surface element. Live DOM nodes, native event objects, and renderer-native reactive values MUST NOT cross into the runtime; only immutable snapshot data does.

#### Scenario: Native event becomes an immutable snapshot

- **WHEN** the adapter observes a native input event on a root for which core registered interaction interest
- **THEN** it produces an immutable snapshot, invokes the registered delivery callback, and never passes the live DOM node or native event object into the runtime

#### Scenario: No external listener required

- **WHEN** core registers interaction interest on a mounted root through the port
- **THEN** the adapter wires capture through its own event layer, without the application selecting the surface element or attaching a native listener itself

### Requirement: Semantic event emission from interaction

The adapter SHALL report a captured interaction to the runtime through the port's interaction-registration delivery callback, and the runtime's interaction-binding contract SHALL dispatch the mapped semantic event through the runtime's own event contracts. The dispatched event MUST be a framework-owned semantic event, independent of SolidJS or DOM event objects, and the adapter MUST NOT dispatch runtime events itself.

#### Scenario: Interaction emits a semantic event

- **WHEN** a mounted root whose interaction is bound receives a native interaction the adapter captures
- **THEN** the adapter delivers a snapshot through the port and the runtime dispatches the bound semantic event through its own event contracts

### Requirement: Deterministic disposal

Unmounting or releasing a root through the adapter MUST dispose every SolidJS reactive effect, DOM listener, and interaction registration the adapter created for it. After disposal no reactive effect runs, no DOM listener remains, and no delivery callback fires, and repeated disposal repeats no cleanup.

#### Scenario: Unmount leaves no effects or listeners

- **WHEN** a mounted root is unmounted
- **THEN** its SolidJS effects are disposed, its DOM listeners and interaction registrations are removed, and no further reactive updates or deliveries occur

#### Scenario: End-to-end lifecycle

- **WHEN** one component mounts, reacts to a change, has an interaction captured that emits a semantic event, and then unmounts
- **THEN** the sequence completes and leaves no reactive effect, DOM listener, or interaction registration behind
