## Context

The element membrane (light-DOM, ephemeral) shipped one-way: a host embeds a
component and interacts with it, but no semantic event reaches host code. This change
adds the outward direction.

A subtlety of the current membrane sets the design: the app's `mount` factory owns
the composition — it creates the runtime, the event runtime, and the trace/relayer.
The membrane does not see the event stream. So the membrane cannot, on its own,
"observe an EventClass and relay it"; the app must be the one that decides which
event maps to which outward name, because only the app holds the event runtime.

## Goals / Non-Goals

**Goals:**

- Let a host receive a Velkren semantic event as a DOM `CustomEvent`, under a
  host-chosen name, without importing Velkren.
- Keep the runtime authoritative: the outward event is a notification, never a veto.
- Keep `@velkren/core` host-blind and unchanged.
- Prevent the outward leak (a live reference reaching host code) by construction.

**Non-Goals:**

- A declarative outward-event map in the registration config (imperative helper this
  increment).
- Host→runtime veto / negotiation events.
- `composed`/shadow-boundary behavior (the shadow surface is a separate change).
- Inbound data crossings, durable lifetime (separate changes).

## Decisions

### 1. A membrane-provided dispatch helper, wired by the app

The membrane's mount context gains `dispatchBoundaryEvent(name: string, detail:
JsonObject): void`. The app's factory wires it to its own event observation — inside
the event runtime's `traceSink` (or a relayer), on a completed boundary event it
calls `dispatchBoundaryEvent(outwardName, record.snapshot)`.

- **The split**: the app owns the _mapping_ (which EventClass → which outward name,
  read from its own event runtime); the membrane owns the _DOM mechanics_ (the host
  element target, the event options, and freezing `detail`). This is the only split
  that works given the app owns the composition, and it keeps the DOM dispatch inside
  the membrane rather than in app code.
- **Alternatives rejected**:
  - _Declarative `outwardEvents` map in the config_: the membrane would have to
    observe the app's event runtime, which it does not hold — it would need the
    factory to hand back an event source, inverting the current "app builds the
    composition" shape. Deferred as a possible future refinement once the mechanism
    proves out.
  - _App dispatches the `CustomEvent` itself_: puts DOM dispatch and the option/freeze
    discipline in app code, so every app re-implements (and can get wrong) the
    notification-not-negotiation contract. Rejected — the membrane owns the mechanics.

### 2. Notification, not negotiation

`dispatchBoundaryEvent` always dispatches on the host element with `bubbles: true`
and **`cancelable: false`**. A cancelable event whose `preventDefault` steered the
runtime would let a host DOM handler exercise authority over a runtime decision — the
inbound leak in disguise, with a synchronous-timing hazard. This is a deliberate
deviation from the common Web Component cancelable-event pattern, which assumes
element-as-authority. If host influence is ever needed, it must be a separate,
explicit inbound crossing the runtime arbitrates — never `preventDefault`.

### 3. Frozen snapshot detail; the leak is prevented upstream

`detail` is the semantic event's existing immutable snapshot (`semantic-events`
guarantees closed-schema immutable JSON snapshots), forwarded verbatim and frozen by
the helper. Because the event never carried a live reference inward, the membrane
physically cannot leak one outward — the guard is inherited, not a runtime check. The
only discipline: the helper adds nothing that is not itself a snapshot (no
"convenience handle").

### 4. Name decoupled from the internal EventClass

The outward name is the string the app passes to `dispatchBoundaryEvent`, chosen at
the call site — independent of the internal EventClass identity. Renaming an internal
EventClass does not change the outward name, so the host's `addEventListener` contract
stays stable. The outward name/`detail` shape is a published contract and carries the
usual stability obligations.

## Risks / Trade-offs

- **App forgets to freeze / adds a live handle to `detail`** → the helper freezes and
  only accepts a `JsonObject`; the snapshot from the event runtime is already
  immutable, so a live reference cannot be typed in.
- **A host relies on `preventDefault`** → non-cancelable by construction; documented
  as notification-only.
- **Imperative wiring is less discoverable than a declarative map** → accepted for
  this increment; a declarative map is a recorded future refinement.
- **Outward event dispatched on the host element under light DOM** → `bubbles: true`
  is enough and `composed` is moot; the shadow surface (a separate change) will
  revisit `composed`.

## Open Questions

- **Declarative `outwardEvents` map**: worth adding once the imperative helper proves
  out? It would need the factory to expose an event source to the membrane.
- **Outward event naming convention**: recommend a namespace prefix (e.g.
  `velkren:save`) to avoid collision with standard/host events — recommendation vs.
  enforcement.
- **`dispatchBoundaryEvent` return**: keep `void` (fire-and-forget notification), or
  return whether any listener was present? Default `void`; a return could leak a weak
  form of host feedback and is unnecessary for a notification.
