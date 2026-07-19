## ADDED Requirements

### Requirement: Durable multi-view via a host-owned service

The membrane SHALL compose with a host-owned application service to give document
state that outlives any single view, with no `@velkren/core`, renderer-port, or
membrane change. Each view SHALL be an ordinary ephemeral membrane whose component
references the service; document state SHALL live in the service, which is not owned by
any runtime. Detaching a view SHALL dispose only that view's runtime and its service
subscription, leaving the service and its state intact. Multiple views SHALL share one
service, and cross-view coordination SHALL be app-wired through the service's own
subscription rather than a shared runtime or shared semantic events. A newly attached
view SHALL read the current state from the service.

#### Scenario: State outlives a disposed view

- **WHEN** two views share a host-owned service, one view is destroyed, and the service still holds the document state
- **THEN** only the destroyed view's runtime is released, the service and its state survive, and the remaining view stays live

#### Scenario: Cross-view coordination through the service

- **WHEN** an interaction in one view updates the host-owned service
- **THEN** every other view subscribed to the service re-renders to reflect the new state, without a shared runtime or shared semantic event

#### Scenario: A new view reads the current state

- **WHEN** a new membrane view is attached after the service's state has changed
- **THEN** it reads the current state from the service and renders it

#### Scenario: A disposed view stops receiving updates

- **WHEN** a view is destroyed and the service later changes
- **THEN** the destroyed view's subscription has been removed and it receives no further updates
