## 1. Demo package scaffold

- [ ] 1.1 Create `packages/demo/package.json`: `private: true`, no `main`/`exports` (never published), `dependencies` on `@velkren/core`, `@velkren/neutral-composition-fixture`, `@velkren/solid-adapter`, `@velkren/react-adapter`, `@velkren/vue-adapter` (all `workspace:*`/`0.1.0` matching the monorepo's existing workspace-dependency convention), `devDependencies` on `vite` and `typescript`; scripts `"build": "vite build"`, `"dev": "vite dev"`.
- [ ] 1.2 Create `packages/demo/tsconfig.json` extending the repo's `tsconfig.base.json`, scoped to `src/**/*.ts` only, `noEmit: true` (Vite handles transpilation; this tsconfig is for editor/type-checking only, not part of the root `tsc -b` project-reference graph).
- [ ] 1.3 Create `packages/demo/vite.config.ts` — minimal: `root: "."`, default build output to `dist/`.
- [ ] 1.4 Create `packages/demo/index.html`: a bare page shell with a `<div id="app">` mount point, a `<script type="module" src="/src/main.ts"></script>`, and inline `<style>` for a simple three-column layout (one column per adapter) plus a shared activity-log panel — no CSS framework.

## 2. Demo entry point

- [ ] 2.1 In `packages/demo/src/main.ts`, write a `mountDemo(label, makeRenderer)` helper: creates a labeled container section, calls `makeRenderer(mountElement)` to get a renderer, calls `createEditorApp(renderer)`, then `await app.createEditor("one")` and `await app.createEditor("two")`.
- [ ] 2.2 Call `mountDemo` three times — `createSolidRenderer({ container })`, `createReactRenderer({ container })`, `createVueRenderer({ container })` — appending each into its own column.
- [ ] 2.3 Render a shared activity log: after each editor's button is clicked, `app.emissions` grows; poll or re-render the log element on a short interval (e.g. `requestAnimationFrame` loop or a `setInterval`) showing the current `emissions` array per app instance, so a viewer can see clicking "Editor one" only ever appends `"one"`, never `"two"`, proving isolation.
- [ ] 2.4 Do not use `renderer.simulateInteraction`/`EditorApp.activate()` anywhere in the demo — rely entirely on real DOM click events reaching each adapter's own native container listener, exactly as a real user interacting with the page would.

## 3. Deployment workflow

- [ ] 3.1 Create `.github/workflows/deploy-demo.yml`: triggers on `push` to `main`; `permissions: { pages: write, id-token: write }`; one job that runs `npm ci`, `npm run build --workspace=packages/demo` (or `cd packages/demo && npm run build`), then `actions/upload-pages-artifact` pointing at `packages/demo/dist`, then a second job/step using `actions/deploy-pages` to publish it. Use the `github-pages` deployment environment per GitHub's documented Pages-via-Actions pattern.
- [ ] 3.2 Do not modify `.github/workflows/ci.yml` — the demo deploy is a fully separate workflow so a demo-only failure can never block the existing build/test/lint/format gate.

## 4. Verification and documentation

- [ ] 4.1 Run `npm install` at the repo root (registers the new workspace package and its dependencies), then `npm run build`, `npm test`, `npm run lint`, `npm run format:check` at the root — confirm the new package does not break any existing script (it is excluded from `tsc -b`'s project references, so `npm run build` should be a pure no-op with respect to `packages/demo`).
- [ ] 4.2 From `packages/demo`, run `npm run build` (`vite build`) and confirm it produces a `dist/index.html` plus bundled JS with no errors; manually open the built `dist/index.html` (or `vite preview`) in a browser and click each of the six editor buttons (two per adapter), confirming the activity log updates correctly and each editor is isolated from the others.
- [ ] 4.3 Update `BACKLOG.md`: mark the deferred "demo" thread as done, with the actual shipped outcome (a static three-adapter showcase page, not a broader feature-tour site).
- [ ] 4.4 Commission an independent adversarial review before committing apply output, focused on: does the demo introduce any dependency or build step that could affect the existing root `build`/`test`/`lint`/`format:check` scripts; is the GitHub Actions Pages workflow correctly scoped (permissions, trigger, environment) per current GitHub documentation; does the demo avoid any test-only affordance (`simulateInteraction`) that wouldn't work the same way for a real user.
