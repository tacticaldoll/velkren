## Why

The membrane (`@velkren/element`, realized by the Solid, React, and Vue
adapters) currently carries no host data inward at all: every embed is
data-less. A real embed needs to configure the mounted component from
host-authored markup (an HTML attribute) or host-assigned JavaScript
properties, and it must do so without bypassing the runtime's existing
immutable-snapshot boundary — the same boundary `interaction-binding` already
enforces for inbound interactions and `managed-state`'s `StateHandle.update`
already enforces for state writes. This change adds that inbound crossing:
observed attributes and declared data properties on the membrane element
cross inward and drive a bound `StateHandle`, reusing the existing
state/binding domain rather than inventing a parallel one.

## What Changes

- `@velkren/element`'s `MembraneConfig<R>` gains two optional fields:
  `observedAttributes?: readonly string[]` and
  `dataProperties?: readonly string[]`, each naming what crosses inward.
- `MembraneMountContext<R>` gains `onAttributeChange(name, handler)` and
  `onPropertyAssign(name, handler)`. A host factory (inside `mount()`) calls
  these to register a handler for a declared name; the handler fires once
  immediately with the attribute/property's current value, then again on
  every later change. Both return an unsubscribe function.
- The membrane element gains a `static get observedAttributes()` (reading
  from the per-tag config, the platform's own opt-in mechanism) and, in its
  constructor, a plain accessor property for each declared `dataProperties`
  name so a host assignment (`element.someProp = value`) is captured.
- Values cross as raw data (an attribute's string, or whatever a property was
  assigned) — `@velkren/element` does **not** validate or snapshot them
  itself. The host factory's handler is expected to route the value through
  `StateHandle.update`, which already enforces the strict-JSON snapshot
  boundary and throws `InvalidStateValueError` for anything that isn't valid
  snapshot data (a function, a live object, a cycle, etc.). A handler that
  throws is caught by the membrane and reported through the existing
  `reportMembraneError` failure channel — never a synchronous throw out of
  `attributeChangedCallback` or a property setter.
- Pre-mount attribute/property changes (an attribute already present at
  upgrade time, or a property assigned before the element is connected) are
  buffered and delivered as the "current value" the first time a handler is
  registered, so no crossing is silently dropped.
- **BREAKING**: none. Both new `MembraneConfig` fields and both new
  `MembraneMountContext` methods are additive and optional; an existing
  membrane definition that ignores them is unaffected.

## Capabilities

### New Capabilities

<!-- none: this extends the existing element-membrane capability -->

### Modified Capabilities

- `element-membrane`: adds inbound attribute and data-property crossings,
  routed through the existing state/binding domain, with a snapshot-or-reject
  boundary already enforced by `StateHandle.update` (no new core export
  needed). No existing element-membrane requirement's behavior changes.

## Impact

- **Code**: `packages/element/src/index.ts` (the shared, renderer-agnostic
  membrane core) gains the config fields, context methods, buffering, and
  dispatch logic. No adapter package (`solid-adapter`, `react-adapter`,
  `vue-adapter`) needs a code change — each already re-exports
  `MembraneConfig`/`MembraneMountContext` from `@velkren/element` unchanged —
  but each adapter's existing membrane test file gains a new test exercising
  the crossing on that adapter's renderer.
- **APIs**: `@velkren/core`'s public surface is unchanged — this reuses the
  already-public `StateHandle.update`/`InvalidStateValueError` rather than
  exporting a new snapshot utility.
- **Dependencies**: none added.
- **Non-Goals**: no typed props contract (deferred to `add-typed-view-props`
  per the backlog); no mechanism to seal the element against an arbitrary
  _undeclared_ property assignment (would require proxying or sealing the
  whole `HTMLElement` instance — a materially larger, riskier change with no
  existing precedent); no authorization-handoff protocol for handing a live
  capability or reference across the membrane boundary in either direction —
  the existing "Authority stays inside the runtime" requirement already
  forbids granting operate-authority through the element surface, and no
  concrete inbound-authorization mechanism exists to build on, so this is left
  reserved/unbuilt rather than invented speculatively.
