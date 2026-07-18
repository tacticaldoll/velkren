## 1. Make the fixture renderer-agnostic

- [x] 1.1 In `packages/two-editor-validation/src/index.ts`, define and export `RendererTestHarness` = `RendererPort` plus `simulateInteraction(identity: string, type: string): void` and `elementForIdentity(identity: string): unknown`.
- [x] 1.2 Change `createEditorApp` to take a `renderer: RendererTestHarness` parameter instead of calling `createSolidRenderer()`; remove the `@velkren/solid-adapter` import from the source.
- [x] 1.3 Remove the `container` field from `EditorApp` and the `element` (`HTMLElement`) field from `Editor` (both were renderer-specific DOM leaks). Expose each editor's `Projection`, `scope`, and the `activate`/`retemplate`/`dispose` methods; identity is read by callers via `editor.root.identity`. Drive interaction via `renderer.simulateInteraction(identity, type)` and check presence via `renderer.elementForIdentity(identity) !== undefined` only.
- [x] 1.4 Add an `exports` block (and `files: ["dist"]`) to `packages/two-editor-validation/package.json` mirroring the adapters (`{".": {"types": "./dist/index.d.ts", "default": "./dist/index.js"}}`) so `@velkren/two-editor-validation` is importable by other packages.
- [x] 1.5 Move `@velkren/solid-adapter` from dependencies to devDependencies in `packages/two-editor-validation/package.json`.

## 2. Solid validation injects the shared composition

- [x] 2.1 Update `packages/two-editor-validation/test/two-editor.test.ts` to hold a `createSolidRenderer()` handle and call `createEditorApp(renderer)`. Read identity via `editor.root.identity`. Rewrite the former `app.container.children.length`/`contains` assertions against the local `renderer.container` (Solid-specific), and cast `renderer.elementForIdentity(id)` to `HTMLElement` for `toBeInstanceOf` assertions.

## 3. React validation reuses the shared composition

- [x] 3.1 Add `@velkren/two-editor-validation` as a devDependency of `packages/react-adapter`; ensure it resolves in the adapter's browser-like test env (build order: the fixture builds before the adapter test runs).
- [x] 3.2 In `packages/react-adapter/test/two-editor.test.ts`, delete the parallel `createReactEditorApp` and import `createEditorApp` from `@velkren/two-editor-validation`, holding a `createReactRenderer()` handle and injecting it. Read identity via `editor.root.identity`; assert distinct identities, business-event emission through the binding, and scoped disposal (survivor still emits), keeping React/DOM-specific assertions (cast element, `elementForIdentity` undefined after dispose) local.

## 4. Definition of Done

- [x] 4.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root; confirm all pass, the fixture source imports no adapter, `@velkren/two-editor-validation` exports `createEditorApp`, and the dependency graph stays acyclic. Report any command that cannot run.
