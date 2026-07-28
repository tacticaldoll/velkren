## Why

`add-demo-showcase` shipped a static page proving cross-adapter neutrality with the two-editor composition, but explicitly deferred three already-shipped, real Velkren capabilities that the composition never exercises: native nested views (`mountChild` + a registered "Dialog" view), keyed list reconciliation, and membrane embedding into a plain non-Velkren page. A visitor to the current demo cannot see any of these three things — only the base render/interaction/state loop.

## What Changes

- Add three new sections to `packages/demo`, each cycling through all three adapters (Solid/React/Vue) the same way the existing two-editor section does:
  1. **Native nested views**: a registered "Dialog" view per adapter (a plain low-level renderer, not a full component/template runtime, mirroring how each adapter's own test suite already proves this) with a button to mount a managed child into the dialog's anchor via `mountChild`, and a button to unmount it — demonstrating the child's own identity, interaction isolation, and independent lifecycle.
  2. **Keyed list reordering**: a per-adapter renderer rendering a small keyed `<ul>` of `<li>` rows, each containing a live `<input>`, plus a "Shuffle" button that re-commits the same keys in a new order — a visitor can type into one row's input, click Shuffle, and see the typed text follow that row rather than land on whatever row is now in that row's old position.
  3. **Membrane embedding**: one custom element per adapter (`<velkren-solid-widget>`, `<velkren-react-widget>`, `<velkren-vue-widget>`), registered once via `defineVelkrenElement`, placed as **plain static markup** directly in `index.html` — no JS-driven mounting call for these three, demonstrating genuine declarative embedding into a page that doesn't otherwise know Velkren exists.
- No `@velkren/core` or adapter-package source changes — every mechanism used (`mountChild`, keyed `RenderNode.key`, `defineVelkrenElement`/`MembraneConfig`) already ships and is already proven by each adapter's own test suite; this only exposes it on the demo page.
- `packages/demo/src/main.ts` is split into per-scenario modules (`scenarios/two-editor.ts`, `scenarios/nested-views.ts`, `scenarios/keyed-list.ts`, `scenarios/membrane.ts`) so each scenario stays independently readable, with `main.ts` left as a thin orchestrator.

## Capabilities

### New Capabilities

(none — this only exercises existing, already-specified capabilities on the demo page)

### Modified Capabilities

(none — no existing capability's requirements change)

## Impact

- **Code**: changes confined to `packages/demo/` (new scenario modules, updated `index.html`, updated `vite.config.ts` only if needed for the custom-element registration timing). No change under any existing `packages/{core,element,solid-adapter,react-adapter,vue-adapter,neutral-composition-fixture}/src`.
- **Dependencies**: none added — every scenario uses APIs the demo's existing dependencies (`@velkren/core`, `@velkren/solid-adapter`, `@velkren/react-adapter`, `@velkren/vue-adapter`) already expose (`mountChild`, `RenderNode.key`, `defineVelkrenElement`).
- **`@velkren/neutral-composition-fixture`'s exports are not reused by these three scenarios.** Its `templateFor` helper produces a childless `{ kind: "section", attributes: { version } }` with no clickable UI, so it cannot supply the membrane scenario's inner composition; the membrane scenario instead authors its own small local `panelClass`/`panelTemplate` (a `section` with a real `input` + `button`), following the actual `editorMembrane()` pattern already proven in each adapter's `test/membrane.test.ts`. The nested-view anchor wiring and the keyed-list `RenderNode` builder likewise do not exist in any package and are authored fresh in the demo, adapted from `describe("native nested views")`/`describe("keyed child reconciliation")` in each adapter's own test suite.
- **Non-goals**: no new demo scenarios beyond these three explicitly-deferred ones; no visual polish beyond what's needed to make each mechanism legible; no mixed-framework nesting (out of scope for the underlying feature itself, per `add-native-nested-views`).
