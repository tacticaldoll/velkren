## Why

The element membrane is a real, capable surface — but it lives only in
`@velkren/solid-adapter`, so it is Solid-only. That contradicts the membrane's whole
premise: it is renderer-agnostic. Grounding confirms it — the membrane class depends
on the renderer through exactly one call, `createSolidRenderer({ container })`, and
the React adapter's `createReactRenderer` has the identical options shape. The
membrane is renderer-agnostic in fact; only its packaging is Solid-specific.

This change proves that by **extracting the membrane core into a shared, renderer-
agnostic `@velkren/element` package** parameterized by a renderer factory, refactoring
the Solid adapter to consume it (behavior-preserving), and adding a thin React wrapper
plus a React validation. The same membrane core then runs on both shipped adapters.

## What Changes

- Add a new package **`@velkren/element`**: the renderer-agnostic membrane core —
  registration, ephemeral ownership, move-safe detach, the shadow surface, and
  `dispatchBoundaryEvent` — parameterized by an injected renderer factory
  (`defineMembraneElement(tag, config, createRenderer)`). It imports no Solid, no
  React; only `@velkren/core` types and the DOM.
- **Refactor `@velkren/solid-adapter`** to consume `@velkren/element`: its
  `defineVelkrenElement` becomes a thin wrapper binding the shared core to
  `createSolidRenderer`. Behavior-preserving — the existing membrane and durable
  validations pass unchanged.
- **Add the membrane to `@velkren/react-adapter`**: a `defineVelkrenElement` wrapper
  binding the shared core to `createReactRenderer`, plus a React validation
  reproducing the membrane guarantees (mount, isolation, interaction, outward event,
  disposal) through the element boundary on React.
- `@velkren/core` is **unchanged**; the shared core depends only on core types and the
  DOM, and each adapter injects its own renderer.

## Capabilities

### New Capabilities

<!-- None. This restructures how the existing element-membrane capability is realized. -->

### Modified Capabilities

- `element-membrane`: add a requirement that the membrane is a **shared renderer-
  agnostic core** parameterized by a renderer factory, realized by both the Solid and
  React adapters with no `@velkren/core` change — making explicit what the capability
  always intended (the membrane is not adapter-specific).

## Impact

- **New**: `@velkren/element` (the membrane core), a React `defineVelkrenElement`
  wrapper, and a React membrane validation.
- **Refactored**: `@velkren/solid-adapter` — the membrane class moves out to
  `@velkren/element`; the adapter re-exports the membrane types and provides a thin
  `defineVelkrenElement` wrapper. Behavior-preserving; existing tests unchanged.
- **Unchanged**: `@velkren/core`, the `RendererPort`, and the membrane's observable
  behavior.
- **Decision (recorded in design)**: extract a shared core rather than duplicate the
  membrane in the React adapter — the code is identical but for the renderer factory,
  and extraction is what proves renderer-agnosticism.
- **Deferred**: a Vue membrane (awaits `add-vue-adapter`); inbound data crossings.
