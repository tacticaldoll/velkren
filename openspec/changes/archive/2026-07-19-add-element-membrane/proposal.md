## Why

Velkren has proven renderer-agnostic on SolidJS and React, but every path to using
a Velkren component starts inside a Velkren-aware application that imports an
adapter and drives the runtime imperatively. There is no boundary that lets a
Velkren component be dropped into a **non-Velkren host page** — a CMS, a
server-rendered app, another team's framework — the way the platform's own custom
elements can be. That embedding boundary is Velkren's distribution surface, and it
is the natural next seam after per-root container anchoring.

The risk is that the obvious way to build it — make the element hold the
component's state and let the DOM's `connected`/`disconnected` drive lifecycle —
would smuggle authority back onto the surface and violate the constitutional
invariant that runtime state is authoritative and the DOM is a one-way projection.
This change adds the boundary in the one shape that keeps that invariant intact:
the element is a **dumb membrane**, and all authority stays inside the runtime.

This boundary is a distribution surface, not a compatibility target: Velkren does
not become a Web Components framework, does not adopt foreign custom elements as its
component model, and remains no migration target for another UI framework
(PROJECT.md non-goal). The membrane only lets a Velkren component be _delivered_
through a custom-element skin.

This change is deliberately the **minimal first increment** of that boundary: a
light-DOM, ephemeral membrane that is **purely additive** on the existing adapter —
it passes the custom element as the adapter's container, reuses the per-root
container anchor for interaction and identity, and mints a fresh runtime it owns.
Inbound data channels, a durable host-owned lifetime, a shadow-DOM surface, and an
outward semantic-event relay are each deferred to their own follow-on changes so the
first membrane lands with no `@velkren/core` change and no adapter contract change.

## What Changes

- Add a **custom-element membrane** in the adapter layer: `defineVelkrenElement(tag,
config)` registers, once, how a placed tag mounts a Velkren composition into an
  adapter renderer bound to the element as its container. One registration
  authorizes; declarative placement of the tag then creates membranes — mirroring
  `customElements.define`.
- **Ephemeral ownership**: the registered factory mints the composition (including a
  fresh runtime) for each membrane; the membrane owns it and disposes it on confirmed
  detach. No refcounting.
- **Move-safe detach**: a DOM move (disconnect+reconnect) preserves the projection;
  only a confirmed detach past a grace window releases; release is idempotent and
  atomic with respect to reconnection.
- The membrane **reuses** existing mechanisms rather than adding core contracts: it
  _is_ the per-root container (interaction capture and the repairable identity
  attribute in light DOM), and it drives the existing projection, component,
  template, event, and interaction runtimes through their public contracts.
- A **membrane two-editor validation** reproduces the isolation, business-event
  emission (observed through the event domain's trace), and scope-local disposal
  guarantees through the element boundary.
- `@velkren/core` is **unchanged**: no DOM, `CustomEvent`, or host type enters core;
  core remains host-blind and marks no event as boundary-public.

## Capabilities

### New Capabilities

- `element-membrane`: the custom-element output/distribution boundary at its minimal
  increment — registration, factory-based runtime resolution without ambient
  authority, ephemeral ownership and disposal, move-safe detach, the light-DOM
  projection surface and reused container anchor, and the invariants that keep
  authority inside the runtime and core host-blind.

### Modified Capabilities

<!-- None. Core stays unchanged; the light-DOM ephemeral membrane is purely additive
     on the Solid adapter's existing `createSolidRenderer({ container })` API and
     reuses render-root-projection, interaction-binding, component/template/event
     runtimes, and the event trace through their existing public contracts, so no
     existing spec's requirements change. -->

## Impact

- **New**: a membrane surface (`defineVelkrenElement`) in `@velkren/solid-adapter`,
  plus a validation that a membrane-hosted composition reproduces the two-editor
  guarantees through the element boundary.
- **Unchanged**: `@velkren/core` — no new core API, no DOM/`CustomEvent` types — and
  the adapter's `RendererPort` contract (the membrane consumes the existing
  `createSolidRenderer({ container })` additively).
- **Reused**: render-root-projection (identity + commit-repair), interaction-binding
  and the per-root container anchor, the component/template/event/projection/layout
  runtimes, and the event trace.
- **Deferred to follow-on changes**: inbound data crossings (attribute/property →
  snapshot → binding), a durable host-owned lifetime (borrowed scope / projectable
  reference, resilience to a runtime disposed out from under the membrane), a
  shadow-DOM surface (with `composedPath` interaction capture and an interior-styles
  channel), and an outward semantic-event → `CustomEvent` relay. Also deferred (as in
  the broader membrane line): slotted native nesting, typed view props, SSR /
  Declarative Shadow DOM, host→runtime veto events, and a typed interaction-type
  vocabulary.
