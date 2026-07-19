## ADDED Requirements

### Requirement: Outward semantic-event relay via a host-wired dispatch helper

The membrane SHALL provide, in its mount context, a `dispatchBoundaryEvent(name,
detail)` helper that emits a boundary event outward as a DOM `CustomEvent`. The host
factory SHALL wire this helper to its own event observation (the event domain's trace
or a relayer), so a completed semantic event is emitted outward under a host-chosen
name. The membrane SHALL own the DOM mechanics of the dispatch; the host SHALL own the
mapping from an internal event to an outward name. `@velkren/core` MUST remain
host-blind: the relay mechanism and the mapping SHALL live entirely in the
adapter/membrane layer, and core MUST NOT mark any event boundary-public or gain a
`CustomEvent` type.

#### Scenario: A host receives a boundary event it wired

- **WHEN** a host wires `dispatchBoundaryEvent` to its event observation and a mapped semantic event completes inside the membrane
- **THEN** a `CustomEvent` under the host-chosen name is dispatched and a host `addEventListener` on the element receives it

#### Scenario: The mechanism stays in the adapter layer

- **WHEN** the outward relay is implemented and exercised
- **THEN** `@velkren/core` gains no `CustomEvent` type, marks no event boundary-public, and the outward mapping exists only in the host factory and the membrane

### Requirement: Outward events are notifications, not negotiations

`dispatchBoundaryEvent` SHALL dispatch the `CustomEvent` on the host element with
`bubbles: true` and `cancelable: false`. Host influence over runtime behavior MUST
NOT be carried by `preventDefault`; the outward event is a notification only. Any
future host influence over the runtime SHALL be a separate, explicit inbound crossing
the runtime arbitrates, never a cancelable outward event.

#### Scenario: A boundary event bubbles and is not cancelable

- **WHEN** a boundary event is dispatched
- **THEN** it is dispatched on the host element, bubbles, and reports `cancelable` as false

#### Scenario: preventDefault does not steer the runtime

- **WHEN** host code calls `preventDefault` on a dispatched boundary event
- **THEN** the runtime's behavior is unaffected, because the outward event carries no veto path

### Requirement: Frozen snapshot detail with a decoupled outward name

The `CustomEvent` `detail` SHALL be the semantic event's immutable snapshot,
forwarded frozen; the membrane MUST NOT place a live reference in `detail` and MUST
NOT add any value that is not itself a snapshot. The outward name SHALL be the string
the host supplies at the dispatch call site, decoupled from the internal EventClass
identity, so renaming an internal EventClass does not change the host-facing name.

#### Scenario: detail is a frozen snapshot with no live reference

- **WHEN** a boundary event is dispatched with a snapshot
- **THEN** the received `detail` is a frozen snapshot equal to the event's snapshot and holds no live managed reference

#### Scenario: The outward name is independent of the internal event

- **WHEN** a host maps an internal EventClass to an outward name and that internal class is later renamed
- **THEN** the host-facing outward name and its `addEventListener` contract are unchanged
