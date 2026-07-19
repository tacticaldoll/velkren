# Element Membrane

## Purpose

Define the custom-element "membrane": an adapter-side distribution boundary that
lets a Velkren component be embedded into a non-Velkren host page as a custom
element, while all authority — identity, scope, lifecycle, binding, capability —
stays inside the runtime and the element remains a dumb, non-authoritative
projection surface. At this increment the membrane is light-DOM and ephemeral: it
is purely additive on the adapter's renderer (the element becomes the renderer's
container), reuses the per-root container anchor for identity and interaction, and
mints and owns a fresh runtime it disposes on confirmed detach. `@velkren/core`
stays host-blind — no DOM or `CustomEvent` type enters it, and it marks no event as
boundary-public. Inbound data crossings, a durable host-owned lifetime, a shadow-DOM
surface, and an outward semantic-event relay are deferred to follow-on capabilities.

## Requirements

### Requirement: Host-authored membrane registration

A membrane SHALL be established by a single host-authored registration that binds a
tag to a configuration (a factory that mounts a Velkren composition into an adapter
renderer bound to the placed element). That one registration is the authorization;
subsequent declarative placement of the tag in host markup SHALL create membranes
without further per-element authorization, mirroring the platform's own
define-once-then-declarative model. The membrane SHALL NOT be established by
scanning, import order, or a global mutable Velkren registry. The one global
namespace the membrane relies on is the platform's own custom-element registry,
which SHALL hold only a generic membrane class as a boundary primitive; per-instance
resolution SHALL keep instances of one tag independent, so the shared tag
constitutes neither application coordination nor cross-runtime ownership.

#### Scenario: One registration, declarative placement

- **WHEN** a host registers a tag once with a membrane configuration and then places multiple instances of that tag in markup
- **THEN** each placed element becomes a membrane using that configuration, with no additional per-element authorization step

#### Scenario: No ambient establishment

- **WHEN** a tag is placed without any prior host registration
- **THEN** no membrane is established and no runtime authority is acquired by the element

#### Scenario: The shared tag is a boundary primitive, not coordination

- **WHEN** multiple instances of one registered tag exist on a page
- **THEN** each resolves its own composition per instance, the shared platform tag conveys no cross-runtime ownership or coordination, and no Velkren global mutable registry is introduced

### Requirement: Explicit runtime resolution without ambient authority

A membrane SHALL acquire its composition and runtime only from the host-registered
factory. It MUST NOT derive which runtime it belongs to from its position in the DOM
tree, from an ancestor element, from a selector, or from a default singleton. A tag
string or attribute SHALL grant, at most, the ability to _construct_ a composition
through the factory; it MUST NOT hand out an existing runtime's ownership. The
membrane MUST NOT expose its runtime or any owner-validated reference through a
DOM-reachable surface.

#### Scenario: Resolution is explicit, not positional

- **WHEN** a membrane is nested inside another membrane in the DOM
- **THEN** each membrane's composition is whatever its own registered factory provides, and the DOM nesting establishes no scope or ownership relationship between them

#### Scenario: A string never yields an existing runtime

- **WHEN** any caller possesses only the membrane's tag string or an attribute value
- **THEN** it can at most trigger construction through the registered factory and never obtains ownership of an already-live runtime, and the element exposes neither its runtime nor an owner-validated reference

### Requirement: Ephemeral ownership and disposal

At this increment the registered factory SHALL mint the composition — including a
fresh runtime — for each membrane, and the membrane SHALL own that composition's
lifetime and dispose it on confirmed detach. A managed component instance SHALL be
created only through the owning runtime's typed factory. Disposal SHALL cascade
cleanup of the composition the membrane created and MUST NOT silently swallow cleanup
failures. There SHALL be no refcounting: each membrane owns exactly its own
composition.

#### Scenario: A membrane owns and disposes its composition

- **WHEN** a membrane is confirmed detached
- **THEN** the membrane disposes the composition its factory minted, cascading release of the owned instance and root, and surfaces any cleanup failure

#### Scenario: Two membranes dispose independently

- **WHEN** one of two membranes on a page is disposed
- **THEN** only its own composition is released and the other membrane remains fully live

### Requirement: Move-safe detach

Because a DOM move fires disconnect followed by reconnect, the membrane SHALL treat
disconnection as a deferred request, not an immediate release. A release SHALL be
confirmed only after a grace window elapses with no reconnection. Within the grace
window a reconnection SHALL preserve the existing projection, its identity, and its
state. Beyond the grace window, a later reconnection SHALL produce a new projection
rather than continuing the released one. The transition from grace-window expiry to
release SHALL be atomic with respect to reconnection — a reconnection either cancels
a not-yet-executed release or is treated as a new projection, never both — and
release SHALL remain idempotent so no double release occurs.

#### Scenario: A DOM move preserves the projection

- **WHEN** a membrane is removed and re-inserted within the grace window (a move)
- **THEN** its projection, identity, and state are preserved and no release occurs

#### Scenario: A confirmed detach releases

- **WHEN** a membrane is removed and the grace window elapses with no reconnection
- **THEN** the membrane disposes its composition

#### Scenario: Reconnection racing window expiry does not double-release

- **WHEN** a reconnection arrives as the grace window expires
- **THEN** either the pending release is cancelled and the existing projection continues, or the release completes and the reconnection yields a new projection, and in no case does a double release or a reattach to a released root occur

### Requirement: Authority stays inside the runtime

A membrane surface MUST NOT grant the ability to operate a managed instance: not its
tag, not its attributes, and not a value read from the element. The membrane's
identity attribute on the host element SHALL be a repairable projection marker only,
as for any projected root, and MUST NOT authorize any operation.

#### Scenario: Surface presentation does not grant authority

- **WHEN** host code reads the membrane's identity attribute or other element state
- **THEN** none of it authorizes operating the managed instance, and authority remains with the runtime's owner-validated references

### Requirement: Core stays host-blind

Establishing and operating the membrane MUST NOT introduce any DOM, `CustomEvent`,
or host type into `@velkren/core`, and core MUST NOT mark any event as
boundary-public. The membrane SHALL live entirely in the adapter layer.

#### Scenario: Core imports no host types

- **WHEN** the membrane is implemented and exercised
- **THEN** `@velkren/core` gains no DOM or `CustomEvent` dependency and declares no boundary-public event set

### Requirement: Inbound interaction reuses the per-root container anchor

The membrane SHALL be the per-root container: interactions occurring inside it bubble
to the container listener and are delivered through the renderer port as immutable
snapshots, exactly as for the existing container anchor. At this increment the
membrane projects into light DOM, so the adapter identifies the interacted inner node
from the native event target.

#### Scenario: An interaction delivers through the port

- **WHEN** an interaction occurs inside a membrane
- **THEN** the adapter identifies the interacted inner node and delivers the interaction snapshot through the port, and the membrane emits the bound semantic event

### Requirement: Light-DOM projection surface

At this increment the membrane SHALL project its composition into light DOM. The
anchor — the repairable identity attribute and the interaction container listener —
SHALL live on the adapter-owned per-root container within the membrane element. A
shadow-DOM surface is out of scope for this increment.

#### Scenario: The projection renders in light DOM under the membrane

- **WHEN** a membrane mounts its composition
- **THEN** the projection renders in light DOM within the element, carrying the repairable identity attribute and the interaction container listener on the per-root container

### Requirement: Two-editor guarantees hold through the membrane

Two membranes on one page SHALL NOT collide through the shared global tag, and
runtime independence SHALL hold. A membrane-hosted composition SHALL reproduce the
two-editor guarantees — instance isolation, business-event emission observed through
the event domain's trace, and scope-local disposal — with no `@velkren/core` change.

#### Scenario: Two membranes isolate, emit, and dispose independently

- **WHEN** two editor membranes coexist on one page and one is destroyed
- **THEN** the two never collide through the shared tag, each emits its business event (observed through the event trace) when interacted, and destroying one disposes only its owned work while the other remains fully live
