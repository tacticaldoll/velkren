## Context

Both `SolidRenderer` and `ReactRenderer` extend `RendererPort` and expose the same
two non-port test helpers: `elementForIdentity(identity)` and
`simulateInteraction(identity, type)`. They differ elsewhere — `SolidRenderer` has a
shared `container`, while `ReactRenderer` mounts each root under `document.body` and
exposes no shared container — so `container` is **not** part of the shared surface and
the neutral composition must not use it. Both two-editor validations build the same
runtime/components/templates/events/layout/binding, bind a Button interaction to a
business event, drive via `simulateInteraction`, and assert identity isolation,
emission through the binding, and scoped disposal. The only difference is the injected
renderer. Yet the composition is duplicated and each is hardcoded to its adapter, so
nothing proves the _same_ composition is renderer-independent.

## Goals / Non-Goals

**Goals:**

- One renderer-agnostic `createEditorApp(renderer)` composition, mounted on both the
  SolidJS and React adapters with only the injected renderer differing.
- A shared, DOM-neutral test-drive surface both adapters already satisfy.
- No change to `RendererPort` or any `@velkren/core` runtime API; no dependency cycle.

**Non-Goals:**

- No new adapter, mixed-framework tree, or plugin-based renderer selection.
- No new public core API — the shared surface is a test-drive contract in the fixture
  package, not core.

## Decisions

### D1: A DOM-neutral shared test-drive surface, satisfied structurally

Define in `@velkren/two-editor-validation`:

```
interface RendererTestHarness extends RendererPort {
  simulateInteraction(identity: string, type: string): void;
  elementForIdentity(identity: string): unknown;
}
```

`elementForIdentity` returns `unknown` (not `HTMLElement`) so the neutral composition
imports no DOM type; the composition uses it only for presence (`!== undefined`).
`HTMLElement`-typed assertions (e.g. `toBeInstanceOf(HTMLElement)`) stay in each
adapter's own test, where DOM types are in scope. **Why in the fixture, not core**:
the surface is a testing concern; putting it in `@velkren/core` would add a test
harness to the production public API (scope creep) even though `unknown` keeps it
DOM-free. **Why structural**: `createEditorApp(renderer: RendererTestHarness)` accepts
any renderer that structurally matches; `SolidRenderer` and `ReactRenderer` already
declare these members, so neither adapter imports the harness type — no new coupling.

### D2: Constructor injection, acyclic dependencies

`createEditorApp(renderer)` takes the renderer directly — consistent with the
project's constructor-injection, no-plugin-renderer-selection stance. Dependency
direction:

```
two-editor-validation/src  → @velkren/core            (only)
two-editor-validation/test → @velkren/solid-adapter    (dev)
react-adapter/test         → @velkren/two-editor-validation (dev) + @velkren/core
```

No adapter imports the fixture from its source, and the fixture source imports no
adapter, so the graph stays acyclic. The React adapter test importing the fixture's
_source_ (`createEditorApp`) does not pull in Solid, because the fixture source has no
Solid dependency.

### D3: Shared assertions use only the neutral surface; no DOM handles in the fixture

The neutral `EditorApp`/`Editor` expose **no** `container` and **no** DOM `element`
field (both were Solid-specific `HTMLElement` leaks). An `Editor` exposes its
`Projection`, `scope`, its main `RootHandle` as `root` (a core type, not DOM), and the
`activate`/`retemplate`/`dispose` methods; identity is read via `editor.root.identity`.
(`projection.roots.main` is `RootHandle | undefined` under
`noUncheckedIndexedAccess`, so exposing the already-narrowed `root` keeps callers
type-safe.) The composition and the shared
assertions use only: distinct root/instance identities, business-event emission
through the interaction-binding contract (driven by `renderer.simulateInteraction`),
and scoped disposal (a destroyed editor's roots/registrations released, presence gone
via `renderer.elementForIdentity(identity) === undefined`, the survivor still emits).

Each adapter's own test holds its **own renderer handle**
(`const renderer = createXRenderer(); const app = createEditorApp(renderer)`), so it
can call `renderer.elementForIdentity(...)` and, for DOM-specific assertions
(`toBeInstanceOf(HTMLElement)`, Solid's `container.children.length`), cast the opaque
element or use the concrete renderer's own members — none of which the neutral fixture
references.

### D4: Preserve the existing guarantees; this is a refactor, not new behavior

The Solid two-editor guarantees (components compose from public contracts, editors
isolate, template change preserves business events, scoped disposal, interaction
routed through the neutral port) are unchanged — they are re-expressed against the
injectable composition. The React adapter's "core semantics hold on React" guarantee
is now satisfied by running the _same_ composition rather than a parallel copy, which
strengthens it.

## Risks / Trade-offs

- **[Structural drift]** If an adapter renamed a surface method, the fixture would no
  longer accept it. → The `RendererTestHarness` type documents the contract; both
  adapters already match, and each adapter test type-checks the injection.
- **[Fixture dep on solid-adapter for its own test]** Moving solid-adapter to a
  devDependency of the fixture must not leak into the fixture's source graph. → The
  source imports only core; solid-adapter is imported only by the fixture's test.
- **[React test importing the fixture]** Could appear to couple the React adapter to
  the Solid validation. → It imports the fixture _source_ (`createEditorApp` + the
  harness type), which is renderer-agnostic; no Solid code is pulled in.

## Migration Plan

In-repo only; no released consumers.

1. In the fixture, define `RendererTestHarness`, change `createEditorApp` to take a
   `renderer: RendererTestHarness`, remove the `@velkren/solid-adapter` source import,
   and drop the `container`/`element` (`HTMLElement`) fields from `EditorApp`/`Editor`
   (identity is read via `editor.root.identity`). Add a package `exports`
   entry so other packages can import `createEditorApp`. Keep the wiring.
2. Move `@velkren/solid-adapter` to the fixture's devDependencies; its test holds a
   `createSolidRenderer()` handle, injects it, and rewrites container-count assertions
   against that local handle, casting the opaque element for DOM assertions.
3. Replace the React adapter's parallel `createReactEditorApp` with an import of the
   shared `createEditorApp`, holding a `createReactRenderer()` handle and injecting it;
   read identity via `editor.root.identity`; keep React DOM assertions local.
4. Run the full Definition of Done; sync the two-editor-validation and react-adapter
   spec deltas; archive (running the DoD again after sync).

Rollback is a straight revert; no persisted state.

## Open Questions

- Should the shared composition eventually live in its own `@velkren/*-fixtures`
  package rather than the two-editor-validation package? Deferred; the fixture package
  already is that home, renamed in spirit.
