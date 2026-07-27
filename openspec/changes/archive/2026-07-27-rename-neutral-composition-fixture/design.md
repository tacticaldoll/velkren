## Context

`packages/two-editor-validation` is the shared, renderer-agnostic composition
(`createEditorApp(renderer)`) that Solid (in-package), React
(`packages/react-adapter/test/two-editor.test.ts`), and Vue
(`packages/vue-adapter/test/two-editor.test.ts`) each mount with their own
renderer injected, per `extract-neutral-composition`. Its own spec
(`openspec/specs/two-editor-validation/spec.md`) is explicit that these are
"scenario fixtures" and MUST NOT be exposed as a public UI API.

The full reference surface for the current name (excluding `dist/`, the
archive, and `package-lock.json`, which is regenerated):

- `packages/two-editor-validation/**` (directory + `package.json` `name`)
- `packages/two-editor-validation/test/boundary.test.ts` (asserts
  `pkg.name === "@velkren/two-editor-validation"`)
- `packages/react-adapter/package.json` (devDependency
  `@velkren/two-editor-validation`)
- `packages/react-adapter/test/two-editor.test.ts` (imports `createEditorApp`
  from `@velkren/two-editor-validation`)
- `packages/vue-adapter/package.json` (devDependency
  `@velkren/two-editor-validation`)
- `packages/vue-adapter/test/two-editor.test.ts` (same import)
- root `tsconfig.json` (`references` entry
  `./packages/two-editor-validation`)
- `openspec/specs/react-adapter/spec.md` (prose names
  `@velkren/two-editor-validation` and "the two-editor composition")
- `openspec/specs/vue-adapter/spec.md` (prose names "the shared two-editor
  composition" / "Vue two-editor validation")
- `openspec/specs/two-editor-validation/spec.md` (the capability itself)

## Goals / Non-Goals

**Goals:**

- Rename the package, its directory, and its spec capability to
  `neutral-composition-fixture` everywhere it is referenced by name, with zero
  behavior change.
- Update the two consuming adapters' spec prose so it names the new package
  and calls the fixture "the shared neutral composition" rather than "the
  two-editor composition," removing the adapter-count ambiguity the rename
  exists to fix.
- Keep the change mechanically verifiable: after the rename, `npm run build`,
  `npm test`, `npm run lint`, and `npm run format:check` all pass unchanged in
  outcome.

**Non-Goals:**

- No change to any exported symbol (`createEditorApp`, `RendererTestHarness`,
  `Editor`, `EditorApp`, component classes, etc.) or its signature.
- No change to `RendererPort`, any `@velkren/core` contract, or any adapter's
  runtime behavior.
- No rename of the in-repo test files that describe the two-editor-instance
  _scenario_ itself (`two-editor.test.ts` in each adapter). "Two editors" is
  still an accurate description of what those tests exercise — isolation
  between two instances — and is unrelated to the package-identity ambiguity
  this change fixes. Only the package/capability identity changes.
- No rewrite of `BACKLOG.md`'s historical entries.

## Decisions

- **New package name**: `@velkren/neutral-composition-fixture`. Ties to the
  already-established "neutral composition" vocabulary from
  `extract-neutral-composition` and keeps "fixture" from the spec's own
  "scenario fixtures" wording, so the "not a public API" signal survives the
  rename.
- **Directory move via `git mv`**, not delete+recreate, so file history is
  preserved for `git blame`/`git log --follow`.
- **Capability modeling in OpenSpec**: modeled as a new capability
  (`neutral-composition-fixture`) superseding a retired one
  (`two-editor-validation`), rather than an in-place "modified" spec, since
  the capability's _identity_ (its directory name under `openspec/specs/`)
  changes, not just its requirements text. `react-adapter` and `vue-adapter`
  are separate "modified" capabilities: their requirement _behavior_ is
  unchanged, only the prose identifier they reference.
- **`package-lock.json`**: not hand-edited. After the rename lands, run
  `npm install` at the root so the lockfile and workspace symlinks
  regenerate against the new package name; verify no stray
  `@velkren/two-editor-validation` entries remain.
- **Ordering within the apply step**: rename the directory and
  `package.json` first, then fix every consumer reference, then run the
  Definition of Done last — so a single local build/test pass is the
  verification gate rather than verifying after each file edit.

## Risks / Trade-offs

- **Stale TypeScript build info** (`dist/.tsbuildinfo`,
  `packages/two-editor-validation/dist/**`) could reference the old path →
  Mitigation: `npm run build` from a clean state (`tsc -b` is incremental but
  a moved `rootDir` invalidates the old `.tsbuildinfo` automatically since the
  path no longer exists; if stale output under the old `packages/` path
  lingers after the directory move, delete it explicitly rather than leaving
  an orphaned `dist/`).
- **npm workspace symlink staleness** in `node_modules/@velkren/*` pointing at
  the old directory name → Mitigation: `npm install` after the rename,
  before running the Definition of Done.
- **Missed reference** (e.g. a docs mention or a not-yet-grepped file) →
  Mitigation: re-run a repo-wide grep for the literal string
  `two-editor-validation` (excluding `dist/`, `openspec/changes/archive/`,
  and `package-lock.json`, which is regenerated) as a task-level check before
  considering the change complete.
- **Capability-rename modeling has no repo precedent** (checked: no prior
  archived change renamed a capability) → Mitigation: apply the "retire +
  supersede" modeling described above; if `openspec sync` cannot express a
  spec-directory rename directly, perform the directory move manually as part
  of the sync step and verify the resulting `openspec/specs/` tree by hand.

## Migration Plan

1. `git mv packages/two-editor-validation packages/neutral-composition-fixture`.
2. Update `packages/neutral-composition-fixture/package.json` `name`.
3. Update the two devDependency entries and two import specifiers in
   `react-adapter` and `vue-adapter`.
4. Update the root `tsconfig.json` reference path.
5. Update `packages/neutral-composition-fixture/test/boundary.test.ts`'s
   expected package name.
6. `npm install` to regenerate the lockfile/workspace symlinks.
7. Run the Definition of Done; fix any residual reference the grep sweep
   turns up.
8. Move the spec directory and update the two adapter spec files' prose as
   part of the sync step (see `tasks.md`).

No rollback beyond `git revert` is needed — the change carries no data
migration and no deployed state.

## Open Questions

No decision is blocked on an answer before starting apply. One conditional
check to resolve during the sync step: confirm `openspec sync` can relocate a
spec directory under a new capability name; if it cannot, perform the
directory move manually (as this design already plans) rather than treating
it as a blocker.
