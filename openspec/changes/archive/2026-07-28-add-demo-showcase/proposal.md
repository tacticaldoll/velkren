## Why

Velkren's renderer-neutrality claim — the same composition running unchanged on SolidJS, React, and Vue — has been proven by tests since `extract-neutral-composition`, but only in Node/happy-dom, never as something a human can actually look at in a browser. A static, publicly-viewable demo makes that proof visible without reading test code, and is a natural, low-risk use of the CI workflow already added in `add-ci-workflow`.

## What Changes

- Add a new workspace package (`packages/demo`, private, unpublished) containing a plain browser entry point that mounts the **existing** `@velkren/neutral-composition-fixture`'s `createEditorApp` three times — once per shipped adapter (`@velkren/solid-adapter`, `@velkren/react-adapter`, `@velkren/vue-adapter`) — each into its own labeled section of one static page, with a live activity log rendering `EditorApp.emissions` so a viewer can click each renderer's two editors and see them isolate.
- Add Vite as the demo package's only new devDependency, used purely to bundle this one static page (`vite build`) — no other package in the monorepo adopts a bundler.
- Add a GitHub Actions workflow (`.github/workflows/deploy-demo.yml`) that builds the demo package and deploys it to GitHub Pages on every push to `main`, using `actions/upload-pages-artifact` and `actions/deploy-pages`.
- **No change to `@velkren/core`, any adapter, or any OpenSpec capability.** The demo reuses `createEditorApp` exactly as the existing test suites already exercise it — no new fixture behavior, no new adapter API.

## Capabilities

### New Capabilities

(none — this adds a demo/deployment artifact, not a runtime capability)

### Modified Capabilities

(none — no existing capability's requirements change)

## Impact

- **Code**: new `packages/demo/` (private package: `index.html`, `src/main.ts`, `package.json`, `vite.config.ts`, `tsconfig.json`); new `.github/workflows/deploy-demo.yml`. No change under any existing `packages/*/src`.
- **Dependencies**: `vite` added as a devDependency of `packages/demo` only (not hoisted as a root/shared tool — every other package stays bundler-free).
- **Manual follow-up required after merge**: GitHub Pages must be enabled once, by a repo admin, under Settings → Pages → Source: "GitHub Actions" — this cannot be done from a git branch/PR, and the workflow's first run will fail (or simply not have anywhere to deploy to) until that one-time setting is flipped.
- **Non-goals**: no design system, no additional demo scenarios beyond the two-editor composition already proven by tests (native nested views, keyed lists, membrane embedding are explicitly left for a future demo iteration if wanted); no custom domain; no multi-page site.
