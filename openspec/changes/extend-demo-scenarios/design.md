## Context

`add-demo-showcase` mounts `createEditorApp` (Panel + TextField + Button, two isolated editors) three times, once per adapter. That composition never exercises `mountChild`/anchors, `RenderNode.key`, or the membrane (`defineVelkrenElement`) — three real, already-shipped, already-tested mechanisms with no visible presence on the demo page. Research into each adapter's own test suite (`describe("native nested views")`, `describe("keyed child reconciliation")`, `test/membrane.test.ts`) confirms every mechanism needed already works identically across Solid/React/Vue; nothing here is new capability work, only new demo-page content.

## Goals / Non-Goals

**Goals:**
- Make a visitor able to see, on the same page as the existing two-editor section, all three previously-deferred mechanisms actually working, cycled across all three adapters as the existing section already does.
- Reuse the exact same low-level patterns already proven in each adapter's test suite — no new `@velkren/core`/adapter behavior, only new demo-page wiring around existing public APIs.
- Keep `packages/demo/src/main.ts` from becoming an unreadable single file as scenario count triples: split into one module per scenario.

**Non-Goals:**
- No new demo scenarios beyond these three.
- No mixed-framework nesting (the underlying `add-native-nested-views` feature itself doesn't support it).
- No attempt to make the membrane widget's inner composition richer than the existing two-editor Panel/Field/Button shape — reusing `neutral-composition-fixture`'s exported building blocks keeps the membrane scenario's inner content consistent with what a visitor already saw in the first section, rather than inventing a fourth unrelated mini-app.

## Decisions

**Each new scenario gets its own module under `packages/demo/src/scenarios/`, and the existing two-editor mount logic moves into `scenarios/two-editor.ts` for symmetry.** `main.ts` becomes a thin orchestrator: for each scenario module, call its `mount(label, rendererFactory, columnElement)`-shaped entry point once per adapter. This keeps every scenario's DOM-building, adapter-specific code, and cleanup logic in one place, reviewable independently.

**Native nested views and keyed lists use the low-level renderer directly (`createSolidRenderer`/`createReactRenderer`/`createVueRenderer` + raw `RenderNode` literals), not a full component/template/runtime stack.** This exactly mirrors how each adapter's own test suite proves these two mechanisms (`renderer.createRoot`, `renderer.commit`, `renderer.mountChild` on hand-built `RenderNode`s) — introducing a full `ComponentClass`/`TemplateClass`/`ProjectionRuntime` stack for these two scenarios would add substantial demo-only code with no payoff, since neither mechanism is about the component/template layer at all (nesting and keying are both properties of the render-node tree and the renderer port, independent of whether a `ProjectionRuntime` sits above them).

**The membrane scenario reuses `@velkren/neutral-composition-fixture`'s `panelClass`/`fieldClass`/`buttonClass`/`templateFor`** for its inner composition (adapted from the `editorMembrane()` pattern in each adapter's `test/membrane.test.ts`), rather than inventing new component classes — a visitor who already saw the Panel/Field/Button shape in the first section recognizes the same shape running inside a custom element on a "plain" part of the page, which is a more honest demonstration of "the same composition, now embedded" than a fourth unrelated widget would be. The membrane's `dispatchBoundaryEvent("velkren:submitted", snapshot)` is listened for once at the document level (bubbling, per the membrane's own outward-event contract) and appended to the page's existing shared activity log, so a click inside an embedded widget shows up in the same log the two-editor section already uses.

**The three membrane custom elements are placed as static markup directly in `index.html`, not appended by `main.ts`.** This is the entire point of the scenario: proving a page that doesn't run any Velkren-aware mounting code for these three elements still gets a working, interactive widget once the registering module has loaded — `<velkren-solid-widget>`/`<velkren-react-widget>`/`<velkren-vue-widget>` sit in the HTML exactly like a `<video>` tag would, and `main.ts` only calls `defineVelkrenElement` once per adapter (registration, not placement) before those tags resolve.

**Each membrane custom element gets a distinct tag name per adapter** (`velkren-solid-widget`, `velkren-react-widget`, `velkren-vue-widget`) since `customElements.define` is global per tag name and each adapter needs its own `defineVelkrenElement` binding; a `label` attribute (read via `element.getAttribute("label")`, mirroring `test/membrane.test.ts`'s `editor-id` pattern) distinguishes each instance's log entries.

**The keyed-list scenario proves reconciliation by putting a live `<input>` in each row, not just a static label.** Static labels moving with their key would be visually identical to the *positions* being sorted rather than the *elements* — an `<input>` a visitor can type into, then click "Shuffle" and watch the typed text follow its row (not land on whichever row is now in that position), is a directly legible proof of DOM-element identity preservation, matching the same test-level assertions (`toBe()` on the actual element, a live property surviving) already used in each adapter's test suite.

## Risks / Trade-offs

- **Tripling the demo's scenario count triples its bundle size and page complexity** → acceptable for a demo whose whole purpose is showing capability breadth; still one static page, no routing.
- **The membrane scenario duplicates a chunk of `test/membrane.test.ts`'s wiring** (runtime/component/template/event/projection/interaction-binding construction) since that wiring isn't exported from any package → unavoidable without changing `@velkren/element`'s or an adapter's public API to export a ready-made "quickstart" helper, which is explicitly out of scope (no `@velkren/core`/adapter changes). The duplication is confined to one demo module and kept as close to the proven test pattern as possible to minimize the chance of introducing a new, demo-only bug.
- **Static markup for the membrane widgets means they render as unstyled/empty custom elements until the module's `defineVelkrenElement` call resolves** → acceptable for a demo (a brief flash of unstyled content is normal for any custom-element page); no attempt at a `:not(:defined)` loading-state treatment, since that's cosmetic polish beyond this change's scope.

## Migration Plan

Single change, single PR, entirely inside `packages/demo`. No feature flag — this only adds new page sections; the existing two-editor section and its behavior are unchanged (its mount logic moves file, not shape).
