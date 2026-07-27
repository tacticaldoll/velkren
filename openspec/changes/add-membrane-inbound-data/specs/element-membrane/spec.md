## ADDED Requirements

### Requirement: Inbound attribute crossing

A membrane configuration MAY declare `observedAttributes`, a list of HTML
attribute names. The membrane SHALL observe exactly those attributes on the
host element and, for each, deliver its current string value (or `null` when
absent) to any handler the host factory registers for that name through the
mount context. A registered handler SHALL be invoked immediately with the
attribute's current value at registration time, and again on every
subsequent change to that attribute. The membrane MUST NOT interpret,
validate, or transform the attribute value itself; it SHALL relay the raw
string (or `null`) unchanged.

#### Scenario: A handler receives the current value immediately

- **WHEN** a host factory registers a handler for a declared observed
  attribute during `mount()`
- **THEN** the handler is invoked immediately with the attribute's current
  value (or `null` if the attribute is absent), before `mount()` returns

#### Scenario: A later attribute change reaches the handler

- **WHEN** a registered attribute's value is changed via `setAttribute` or
  `removeAttribute` after mount
- **THEN** every handler registered for that attribute is invoked with the
  new value (or `null` on removal)

#### Scenario: A pre-mount attribute value is not lost

- **WHEN** an observed attribute is already present on the element before
  the membrane mounts (present in markup at upgrade time, or set before the
  element connects)
- **THEN** the first handler registered for that attribute during `mount()`
  is invoked with that already-present value, not `null`

### Requirement: Inbound data-property crossing

A membrane configuration MAY declare `dataProperties`, a list of property
names. The membrane SHALL define an accessor for each declared name on the
element instance so that a host assignment (`element.name = value`) is
captured. Assigning a declared data property SHALL deliver the assigned
value to any handler the host factory registers for that name through the
mount context, following the same immediate-then-on-change delivery as an
observed attribute. The membrane MUST NOT validate, snapshot, or transform
the assigned value itself; it SHALL relay the raw assigned value unchanged.
An accessor for a declared data property SHALL be defined only for names
listed in `dataProperties`; the membrane MUST NOT intercept, seal, or reject
assignment to any other property name — such assignment behaves as ordinary
element property assignment, unaffected by this requirement.

#### Scenario: A property assignment reaches its handler

- **WHEN** a host assigns a declared data property on the element
  (`element.someProp = value`)
- **THEN** every handler registered for that property name is invoked with
  the assigned value

#### Scenario: A pre-mount property assignment is not lost

- **WHEN** a declared data property is assigned before the element connects
  (e.g. immediately after `document.createElement`)
- **THEN** the first handler registered for that property during `mount()`
  is invoked with that already-assigned value

#### Scenario: An undeclared property is not intercepted

- **WHEN** a property name not listed in `dataProperties` is assigned on the
  element
- **THEN** the assignment behaves as ordinary `HTMLElement` property
  assignment and no crossing handler is invoked

### Requirement: Crossing failures are reported, never thrown into a DOM callback

A handler invoked for an attribute or data-property crossing MAY throw (for
example, because it routed the value through a runtime API that rejects
invalid data). The membrane SHALL catch such a throw and report it through
its existing failure-reporting mechanism. The membrane MUST NOT allow a
handler's throw to propagate synchronously out of `attributeChangedCallback`
or a data-property setter.

#### Scenario: A handler's throw is reported, not propagated

- **WHEN** a crossing handler throws while processing an attribute or
  property change
- **THEN** the throw is caught and reported through the membrane's failure
  channel, and no throw propagates out of the attribute or property callback

### Requirement: Crossing handlers are scoped to the current mount

Handler registrations made through the mount context SHALL apply only to the
mount during which they were registered. A confirmed detach followed by a
new mount SHALL start with no registered handlers from any prior mount, so a
disposed composition's handler cannot fire into a new composition's state. A
DOM move (disconnect and reconnect within the grace window, preserving the
existing projection) SHALL NOT reset handler registrations, matching the
existing move-safe-detach behavior for the projection and its state.

#### Scenario: A new mount after confirmed detach starts with no old handlers

- **WHEN** a membrane is confirmed detached, disposed, and later reconnected
  as a fresh mount
- **THEN** no handler registered by the prior, disposed mount is invoked by
  the new mount's attribute or property changes

#### Scenario: A move preserves handler registrations

- **WHEN** a membrane is removed and reconnected within the grace window
- **THEN** handlers registered before the move remain registered and continue
  to receive attribute and property changes after the move
