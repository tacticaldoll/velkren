## Why

The membrane is embeddable and bidirectional, but every view's state dies with its
element: an ephemeral membrane mints and disposes its own runtime. The compelling
next step is a **persistent document with multiple views** — state that outlives any
one element's DOM presence, shared across views.

Investigation of the runtime showed that a _shared interactive runtime across views_
is blocked by design: the event, component, and interaction domains are unique per
runtime ("one runtime = one view/app"). Rather than relax that constitutional-adjacent
boundary, this change delivers durability the way Velkren's own model intends —
**applications own services**. Document state lives in a host-owned service; each view
is an ordinary ephemeral membrane whose component references that service. No
`@velkren/core` change.

## What Changes

- Establish and validate the **durable multi-view pattern**: a host-owned application
  service holds the document state; multiple ephemeral membrane views subscribe to it
  and render it; an interaction in one view updates the service, and subscribed views
  re-render.
- **State outlives any view**: detaching a view disposes only its own runtime; the
  host-owned service and its state survive; a newly attached view reads the current
  state.
- **Cross-view coordination is app-wired** through the service's own subscription,
  consistent with "coordination is explicit" — not through a shared Velkren runtime or
  shared semantic events.
- Add a **docs recipe** (`docs/durable-multi-view.md`) showing the pattern.
- `@velkren/core` and every adapter are **unchanged**: this is a composition pattern
  over the existing ephemeral membrane, proven by a validation.

## Capabilities

### New Capabilities

<!-- None. This extends the existing element-membrane capability with a composition pattern. -->

### Modified Capabilities

- `element-membrane`: add a requirement for **durable multi-view via a host-owned
  service** — document state held in an app-owned service outlives any ephemeral view,
  multiple views share it, view disposal leaves the service intact, and cross-view
  coordination is app-wired through the service, with no `@velkren/core` change.

## Impact

- **New**: a validation in `@velkren/solid-adapter` proving the durable multi-view
  pattern, and a `docs/durable-multi-view.md` recipe.
- **Unchanged**: `@velkren/core`, the `RendererPort`, and the membrane itself — the
  pattern composes the existing ephemeral membrane with an application-owned service.
- **Reused**: the ephemeral membrane (one runtime per element), the component scope /
  reference / service model (a component references a host-owned service), and the
  outward event relay (a view can notify the host too).
- **Non-goal (recorded)**: a shared _interactive_ runtime across views — relaxing the
  per-runtime uniqueness of the event/component/interaction domains is deliberately not
  pursued; durability is an application-service concern, not a runtime concern
  (PROJECT.md: applications own services; Velkren is not a data-owning framework).
