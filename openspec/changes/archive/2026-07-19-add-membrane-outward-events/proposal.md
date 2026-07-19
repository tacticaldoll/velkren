## Why

The just-shipped element membrane is **one-way**: a host can embed a Velkren
component and interact with it, but the host is deaf — no semantic event inside the
membrane reaches host code. A host that embeds an editor cannot learn that the user
pressed "save." Making the boundary emit outward is what turns the membrane from a
one-way embed into a usable product surface.

The risk is the common Web Component reflex — a cancelable event whose
`preventDefault` steers the component. That would let a host DOM handler exercise
authority over a runtime decision (the inbound leak in disguise). This change adds
the outward direction as **notification, not negotiation**, keeping the runtime
authoritative and `@velkren/core` host-blind.

## What Changes

- Add an **outward semantic-event → `CustomEvent` relay** to the element membrane.
  The membrane's mount context gains a `dispatchBoundaryEvent(name, detail)` helper;
  the host's factory wires it to its own event observation (the event domain's trace
  or a relayer) so a completed semantic event is emitted outward under a host-chosen
  name.
- The membrane **owns the DOM mechanics**: it dispatches the `CustomEvent` on the
  host element with `bubbles: true` and **`cancelable: false`**, and freezes the
  `detail`. The host chooses the mapping (which event → which outward name), so the
  outward name is **decoupled** from the internal EventClass identity.
- `detail` is the event's **immutable snapshot**, forwarded frozen; the membrane
  adds nothing that is not itself a snapshot, and never places a live reference in
  `detail`.
- Host influence over the runtime is **never** carried by `preventDefault`; the
  outward event is a notification only.
- `@velkren/core` is **unchanged** and stays host-blind: the boundary-public
  mechanism and the name mapping live entirely in the adapter/membrane layer; core
  marks no event boundary-public and gains no `CustomEvent` type.

## Capabilities

### New Capabilities

<!-- None. This extends the existing element-membrane capability. -->

### Modified Capabilities

- `element-membrane`: add requirements for the outward semantic-event → `CustomEvent`
  relay — the host-wired dispatch helper, the notification-not-negotiation contract
  (dispatched on the host element, bubbling, non-cancelable, no `preventDefault`
  path), and the frozen-snapshot `detail` with the outward name decoupled from the
  internal EventClass.

## Impact

- **New**: a `dispatchBoundaryEvent` helper on the membrane mount context in
  `@velkren/solid-adapter`, plus a validation that a membrane-hosted composition
  emits a host-facing `CustomEvent` a host `addEventListener` receives.
- **Unchanged**: `@velkren/core` — no new core API, no `CustomEvent` type, marks no
  event boundary-public. The existing "Core stays host-blind" requirement continues
  to hold for this surface.
- **Reused**: the event domain's trace/relayer (the app observes its own events),
  semantic events' immutable snapshots (the frozen `detail`), and the membrane's
  existing host-element anchor (the dispatch target).
- **Deferred (explicit non-scope)**: a declarative outward-event map in the
  registration config (this increment is the imperative dispatch helper);
  host→runtime veto / "negotiation" events (a separate explicit inbound crossing, if
  ever); `composed` behavior for the deferred shadow-DOM surface.
