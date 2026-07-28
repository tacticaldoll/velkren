## Why

The view registry's props channel currently reuses `RenderNode.attributes` — a `JsonObject` also used as literal HTML attributes for primitive nodes. This is untyped and dual-use: a template author cannot tell, from the node shape alone, whether a given key is meant as a DOM attribute or a view prop, and `@velkren/core`'s structural validation of `attributes` (strict-JSON only) is the only guarantee a view prop gets. Now that the view mechanism has proven out end to end (registry, root views, anchors, native nesting), the props channel should become its own distinct, validated node shape instead of continuing to borrow the primitive one.

## What Changes

- **BREAKING**: `TemplateNode` and `RenderNode` become a discriminated union: the existing primitive shape (`kind`, `attributes`, `children`, `slots`) is preserved unchanged as one variant, and a new `view` variant (`{ node: "view", viewId, props }`) is added as a distinct, self-contained leaf shape with no `children`/`slots` of its own (nesting under a view continues to go through the existing `mountChild`/anchor mechanism, unaffected by this change).
- `@velkren/core` validates the new `view` node's structural shape at template-authoring time (`viewId` non-blank, `props` strict-JSON) exactly as it already validates primitive nodes — without referencing any concrete view type, adapter, or registry, preserving the existing renderer-neutrality invariant.
- Each adapter's view registry (Solid/React/Vue) is now keyed by `viewId` and consulted only for `view`-variant nodes; a primitive node with a `kind` string never triggers a registry lookup. A registered view receives the node's `props` (not `attributes`) as its props. Since a view node has no tag name to fall back to, an unregistered `viewId` (or no registry configured) is now an explicit error rather than a primitive-element fallback.
- The fake renderer gains the same discrimination for core-level tests.

## Capabilities

### New Capabilities

(none — this refines the existing view-props channel rather than introducing an independent capability)

### Modified Capabilities

- `template-render-plans`: `RenderNode`/render-plan node shape becomes a discriminated union (primitive vs. view); the view variant is validated for strict-JSON `props` and a non-blank `viewId` at plan-construction time.
- `view-registry`: the neutral props channel changes from `attributes` on a `kind`-matched node to `props` on a distinct `view`-variant node keyed by `viewId`; registry lookup no longer happens for primitive nodes.
- `solid-adapter-prototype`: the Solid view registry is consulted only for `view`-variant nodes, keyed by `viewId`, passing `props` (not `attributes`) to the view.
- `react-adapter`: the React view registry is consulted only for `view`-variant nodes, keyed by `viewId`, passing `props` (not `attributes`) to the view.
- `vue-adapter`: the Vue view registry is consulted only for `view`-variant nodes, keyed by `viewId`, passing `props` (not `attributes`) to the view.

## Impact

- `packages/core/src/template-class.ts` (`TemplateNode`, `RenderNode`, `freezeNode` validation), `packages/core/src/template-runtime.ts` (render-plan construction from template nodes), `packages/core/src/fake-renderer.ts`.
- `packages/solid-adapter/src/index.ts`, `packages/react-adapter/src/index.ts`, `packages/vue-adapter/src/index.ts` — view-registry lookup keyed by `viewId` on the `view` variant instead of `kind`; each adapter's reconcile/patch path also gains a primitive↔view variant-transition case (a commit changing a tree position's variant), which could not occur before this change.
- `packages/core/src/renderer-port.ts` and `packages/core/src/state-binding.ts` reference `RenderNode` in their signatures (`commit`, `StateDerivation`); neither needs a structural change, but both must be checked (`tsc`) against the new union.
- Every existing test/fixture that authors a registered-view node via `kind`/`attributes` must switch to the new `view`/`viewId`/`props` shape (`packages/core/test/*`, each adapter's test suite, `packages/neutral-composition-fixture`). This includes retiring or reworking any existing adapter test that currently asserts a registered-view node's `children` are dropped (that fixture shape can no longer be authored once a view node has no `children` field) — see `tasks.md` §4.2.
- No `@velkren/core` change to the `RendererPort` interface itself, ownership, or lifecycle semantics — this is confined to the render-node shape and its consumption.
