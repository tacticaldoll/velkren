## Context

`packages/neutral-composition-fixture` already proves cross-adapter neutrality: `createEditorApp(renderer)` builds two isolated editors (a Panel with a TextField and a Button) on whatever `RendererPort` it's given, and every adapter's test suite already mounts it via `createSolidRenderer()`/`createReactRenderer()`/`createVueRenderer()` in a `happy-dom` Vitest environment. Nothing in the repo currently produces a real, browser-loadable page — there is no bundler, no `index.html`, and no deploy workflow anywhere in the monorepo (only `.github/workflows/ci.yml`, which runs the existing `build`/`test`/`lint`/`format:check` scripts).

## Goals / Non-Goals

**Goals:**
- Let a human open a URL and see the same composition running, side by side, on all three adapters — clicking each editor's button and watching only that editor's activity appear in a log, without reading any test code.
- Reuse `createEditorApp` exactly as-is; the demo is a *consumer* of the existing fixture, not a new fixture or a new public API.
- Keep the new tooling (a bundler) scoped to one throwaway-simple package, not adopted repo-wide.

**Non-Goals:**
- No new demo scenarios beyond the two-editor composition (native nested views, keyed lists, membrane embedding are real, already-shipped features, but adding them to the demo is a separate future iteration, not bundled into this one).
- No design system, styling framework, or component library — inline `<style>` and plain DOM only, matching the project's own "fixtures, not a public UI library" posture.
- No custom domain, no analytics, no multi-page routing.

## Decisions

**A new private workspace package (`packages/demo`), not a script in an existing package.** The demo needs a bundler and a browser entry point; neither belongs inside `@velkren/core` or any adapter package, whose whole point is to stay a plain `tsc`-built library. A separate `private: true`, unpublished package keeps this scoped and matches how `packages/neutral-composition-fixture` itself is already a private, test-only workspace member.

**Vite, not a hand-rolled bundler config or a CDN-script page.** Vite needs near-zero configuration for "bundle one TS entry point importing a few ESM workspace packages and their peer deps (`solid-js`, `react`, `react-dom`, `vue`)," handles the three frameworks' differing module shapes without per-framework plugins (no JSX is used — every adapter's own source already calls `createElement`/`h` directly, so the demo's own code can do the same), and is the de facto standard choice for exactly this "bundle a static page" task. It is scoped as `packages/demo`'s own devDependency, not hoisted to the root `package.json`, so no other package's build gains a new tool.

**`vite.config.ts` sets `base: "./"` (relative asset paths), not the default `"/"`.** An adversarial review caught that this repo (`tacticaldoll/velkren`, no `CNAME`) deploys as a GitHub Pages *project* site at `/velkren/`, not the domain root; Vite's default root-absolute asset paths would 404 there while looking completely correct in a local `vite build`/`vite preview` (which serves from the filesystem root), so the bug would only surface on the real deployed page — exactly the failure mode this change exists to avoid. A relative base fixes this for any subpath, a future custom domain, and local preview alike, with no environment-conditional configuration needed.

**Every `@velkren/*` dependency in `packages/demo/package.json` uses the same bare exact-version string every other package already uses (`"0.1.0"`), not a `workspace:*` protocol specifier.** npm workspaces (this repo's package manager) does not understand `workspace:` — that syntax is pnpm/Yarn-specific and would break `npm install` if used here; this was corrected after an adversarial review flagged it during propose.

**The demo package is excluded from the root `tsc -b` project-reference graph and the root `build`/`test`/`lint` scripts remain unchanged.** It has its own `package.json` scripts (`vite build` for the static output); the root `npm run build` (`tsc -b`) does not need to compile it (Vite handles its own TS transpilation), and CI's existing `build-test-lint-format` job is untouched — a separate `deploy-demo.yml` workflow builds and deploys the demo independently, so a demo-only failure can never block the existing merge-gating CI job.

**Deploy via `actions/upload-pages-artifact` + `actions/deploy-pages` on push to `main`, not a `gh-pages` branch push.** This is the current GitHub-recommended mechanism (no extra branch to manage, deployment history visible in the Environments UI) and requires the one-time "Source: GitHub Actions" repo setting mentioned in the proposal's Impact section — a manual step outside this change's own reach.

**The demo calls `renderer.simulateInteraction` nowhere — real DOM clicks only.** `EditorApp.activate()` (test-only, uses `simulateInteraction`) is not used by the demo; every adapter already registers a real native listener on its container via `registerInteraction`, so an actual mouse click on the rendered `<button>` reaches the binding exactly as `activate()`'s simulated one does in tests. This keeps the demo's own code a thin, honest consumer of the public port, not a copy of a test-only affordance.

## Risks / Trade-offs

- **GitHub Pages must be enabled manually once** (see proposal Impact) → the workflow's first run may fail or have nowhere to publish to until a repo admin flips that one setting; this is called out explicitly rather than assumed.
- **A bundler enters the repo for the first time** → scoped to one non-published package's own `devDependencies`; no shared root tooling changes, so this doesn't affect how any existing package is built, tested, or linted.
- **Three full frontend frameworks (`solid-js`, `react`+`react-dom`, `vue`) load on one static page** → acceptable for a demo (not a production app); no code-splitting/lazy-loading is attempted, since the point is showing all three at once.

## Migration Plan

Single change, single PR: add `packages/demo` and `.github/workflows/deploy-demo.yml` together. No feature flag — this adds a new artifact with no effect on any existing package, script, or workflow. After merge, a repo admin enables GitHub Pages (Settings → Pages → Source: GitHub Actions) once; the next push to `main` (or a manual workflow re-run) then publishes the page.
