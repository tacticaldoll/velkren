## MODIFIED Requirements

### Requirement: Light-DOM projection surface

By default the membrane SHALL project its composition into light DOM. The anchor —
the repairable identity attribute and the interaction container listener — SHALL live
on the adapter-owned per-root container within the membrane element. A shadow-DOM
surface is available as an explicit opt-in (see the shadow-DOM projection surface
requirement); when none is configured, the surface is light DOM.

#### Scenario: The projection renders in light DOM under the membrane

- **WHEN** a membrane with no shadow surface configured mounts its composition
- **THEN** the projection renders in light DOM within the element, carrying the repairable identity attribute and the interaction container listener on the per-root container

## ADDED Requirements

### Requirement: Shadow-DOM projection surface (opt-in)

The membrane SHALL support an opt-in shadow-DOM surface selected in the registration
config. When enabled, the membrane SHALL attach a shadow root to the host element and
project the composition inside it, so the surface is style-encapsulated and the light
DOM under the element stays empty. The interaction container listener SHALL live
inside the shadow root with the projection, so interactions are captured from the
native event target without crossing the shadow boundary and without `composedPath`.
The anchor — identity attribute, commit repair, and the interaction listener — SHALL
remain on the adapter-owned per-root container, now within the shadow root. The
membrane SHALL NOT change `@velkren/core` or the renderer port to do this.

#### Scenario: The projection renders inside the shadow root

- **WHEN** a membrane configured with a shadow surface mounts its composition
- **THEN** the projection renders inside the element's shadow root, the light DOM under the element stays empty, and the per-root container inside the shadow root carries the identity attribute

#### Scenario: Interaction is captured through the shadow root

- **WHEN** an interaction occurs on a node inside a shadow-surface membrane
- **THEN** the adapter identifies the interacted inner node from the native event target and delivers the interaction snapshot through the port, and the membrane emits the bound semantic event

#### Scenario: Outward events still reach the host's light DOM

- **WHEN** a boundary event is dispatched from a shadow-surface membrane
- **THEN** it is dispatched on the host element and bubbles into the host's light DOM, unaffected by the shadow surface

### Requirement: Interior styles are an explicit host channel

When a shadow surface is configured, interior styles SHALL be provided only through an
explicit host channel in the registration config; the membrane MUST NOT copy the host
page's global stylesheets across the shadow boundary. Only the host-provided styles
SHALL be present inside the shadow root.

#### Scenario: Only host-provided styles are inside the shadow root

- **WHEN** a shadow-surface membrane is configured with interior styles and mounts
- **THEN** those styles are present inside the shadow root and no global page stylesheet is copied in by the membrane
