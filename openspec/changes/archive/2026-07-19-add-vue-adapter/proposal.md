## Why

Velkren claims renderer-independence, and two adapters (SolidJS, React) back it. A
third adapter on a framework with a different rendering model — Vue, with its own
reconciler and reactivity — is the strongest remaining hardening of that claim: it
proves the `RendererPort` is not accidentally shaped around the two frameworks it was
first written against.

It is also cheap where it counts: because the membrane is now a shared renderer-
agnostic core (`@velkren/element`), a Vue membrane is a thin wrapper — a third adapter
extends the membrane to a third framework almost for free.

## What Changes

- Add **`@velkren/vue-adapter`**: a `RendererPort` implementation driven by Vue's
  imperative renderer (`render` / `h` from `vue`), with the same per-root container
  anchor (identity attribute + native interaction listener), commit repair, the view
  registry, and the `simulateInteraction` / `elementForIdentity` affordances the other
  adapters expose.
- Add the **two-editor validation on Vue** by reusing `@velkren/two-editor-validation`'s
  `createEditorApp(createVueRenderer())` — the same isolation, emission, and disposal
  guarantees as Solid and React.
- Add a **Vue membrane**: a `defineVelkrenElement` wrapper binding the shared
  `@velkren/element` core to `createVueRenderer`, plus a membrane validation on Vue.
- `@velkren/core` is **unchanged**: the Vue adapter satisfies the existing port; Vue
  and DOM types live only in the new package.

## Capabilities

### New Capabilities

- `vue-adapter`: a Vue `RendererPort` adapter — renderer-neutral render nodes projected
  through Vue's imperative renderer, the per-root container anchor, commit repair, the
  view registry, interaction capture as immutable snapshots, and deterministic unmount;
  plus the Vue membrane via the shared core. No `@velkren/core` change.

### Modified Capabilities

<!-- None. The Vue membrane is realized through the existing element-membrane
     shared-core requirement (which already spans more than one adapter). -->

## Impact

- **New**: `@velkren/vue-adapter` (renderer + membrane wrapper), a Vue two-editor
  validation, and a Vue membrane validation. A new `vue` dependency, confined to that
  package; `vitest.config.ts` inlines `vue` for the same ESM-interop reason as
  `solid-js` / `react`.
- **Unchanged**: `@velkren/core`, the `RendererPort`, `@velkren/element`, and the other
  adapters.
- **Reused**: the `RendererPort` contract, `@velkren/two-editor-validation` (the shared
  renderer-neutral composition), and `@velkren/element` (the membrane core).
- **Deferred**: mixed-framework trees; a Vue-idiomatic reactive-props view path beyond
  the validation set.
