## Why

The SolidJS and React adapters are each validated by a two-editor scenario, but
the two are **parallel copies** of the same composition — `createEditorApp` in
`@velkren/two-editor-validation` (Solid) and `createReactEditorApp` in the React
adapter's test. Each proves its framework can satisfy the guarantees, but neither
proves the _identical_ core composition runs unchanged when only the renderer is
swapped — the gold-standard neutrality proof. Two copies also drift and duplicate
the fixture. This change extracts one renderer-agnostic composition and a shared
test-drive surface so the same `createEditorApp(renderer)` mounts on both adapters
with only the injected renderer differing.

## What Changes

- Make the two-editor composition **renderer-agnostic**: `createEditorApp(renderer)`
  in `@velkren/two-editor-validation` depends only on `@velkren/core`; the renderer
  is injected, not `createSolidRenderer()`-hardcoded.
- Define a **DOM-neutral shared test-drive surface** `RendererTestHarness` =
  `RendererPort` plus `simulateInteraction(identity, type)` and
  `elementForIdentity(identity): unknown`. It carries no `HTMLElement` type, so the
  neutral composition stays free of DOM types; presence is checked via
  `!== undefined`, and any `HTMLElement`-specific assertions stay in each adapter's
  own test. Adapters need no new import — both `SolidRenderer` and `ReactRenderer`
  already structurally satisfy the surface.
- The Solid two-editor test injects `createSolidRenderer()` (solid-adapter moves to
  a dev/test dependency of the fixture package); the React adapter's cross-framework
  validation imports the shared `createEditorApp` and injects `createReactRenderer()`,
  **replacing its parallel copy**.
- Net result: one composition, two renderers, the same assertions — proving core
  semantics are genuinely renderer-independent.

## Capabilities

### New Capabilities

<!-- none: this restructures existing validation capabilities -->

### Modified Capabilities

- `two-editor-validation`: the composition becomes renderer-agnostic (renderer
  injected, no adapter dependency in its source) and defines the shared DOM-neutral
  test-drive surface used to drive it on any adapter.
- `react-adapter`: the cross-framework validation reuses the shared composition with
  the React renderer injected, rather than a parallel React-specific copy.

## Impact

- **Code**: `packages/two-editor-validation/src/index.ts` (parameterize the renderer,
  define `RendererTestHarness`, drop the `@velkren/solid-adapter` source import, and
  remove the `container`/`element` `HTMLElement` fields from `EditorApp`/`Editor` — the
  neutral composition exposes no DOM handle; identity is read via
  `editor.root.identity`) and its test (inject Solid via a local handle);
  `packages/react-adapter/test/two-editor.test.ts` (import the shared composition,
  inject React, delete the parallel copy). `packages/two-editor-validation/package.json`
  gains an `exports` entry (so it is importable) and moves solid-adapter to
  devDependencies; `packages/react-adapter/package.json` gains a dev dependency on the
  fixture.
- **APIs**: no change to `RendererPort` or any `@velkren/core` runtime API. The
  fixture's `createEditorApp` gains a renderer parameter (in-repo consumers only).
- **Dependencies**: dependency direction stays acyclic — the fixture source depends
  only on `@velkren/core`; each adapter's _test_ depends on the fixture; no adapter
  imports the fixture from its source and no cycle is introduced.
- **Non-goals**: no new adapter, no mixed-framework tree, no plugin-based renderer
  selection, no change to the port or core runtime. The shared surface is a
  test-drive contract, not a new public core API.
