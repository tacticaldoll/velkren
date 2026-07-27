## 1. Package and directory rename

- [x] 1.1 `git mv packages/two-editor-validation packages/neutral-composition-fixture`
- [x] 1.2 Update `packages/neutral-composition-fixture/package.json` `name` to `@velkren/neutral-composition-fixture`
- [x] 1.3 Update `packages/neutral-composition-fixture/test/boundary.test.ts`'s expected package name

## 2. Consumer references

- [x] 2.1 Update `packages/react-adapter/package.json` devDependency from `@velkren/two-editor-validation` to `@velkren/neutral-composition-fixture`
- [x] 2.2 Update the import in `packages/react-adapter/test/two-editor.test.ts` to `@velkren/neutral-composition-fixture`
- [x] 2.3 Update `packages/vue-adapter/package.json` devDependency from `@velkren/two-editor-validation` to `@velkren/neutral-composition-fixture`
- [x] 2.4 Update the import in `packages/vue-adapter/test/two-editor.test.ts` to `@velkren/neutral-composition-fixture`
- [x] 2.5 Update the root `tsconfig.json` `references` entry from `./packages/two-editor-validation` to `./packages/neutral-composition-fixture`

## 3. Verification sweep

- [x] 3.1 `npm install` at the repo root to regenerate the lockfile and workspace symlinks (required a clean `node_modules`/`package-lock.json` reinstall — a plain re-run left a stale `extraneous: true` `packages/two-editor-validation` lockfile entry)
- [x] 3.2 Grep the repo for the literal string `two-editor-validation` outside `dist/`, `openspec/changes/archive/`, and this change's own artifacts — resolve or knowingly accept any remaining hit (only remaining hit is `openspec/specs/react-adapter/spec.md`, intentionally deferred to the sync step, section 4)
- [x] 3.3 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` and confirm all four pass (all four passed; `format:check` initially flagged this change's own propose-step markdown files, fixed with `prettier --write`)

## 4. Spec promotion (sync step)

- [ ] 4.1 Move `openspec/specs/two-editor-validation/` to `openspec/specs/neutral-composition-fixture/`, applying this change's ADDED requirements as the new file's content, with a `## Purpose` section adapted from the old one
- [ ] 4.2 Apply the REMOVED delta to retire the old `two-editor-validation` capability (the directory move in 4.1 accomplishes this; confirm no `openspec/specs/two-editor-validation/` remains)
- [ ] 4.3 Apply the MODIFIED delta to `openspec/specs/react-adapter/spec.md`'s "Cross-framework validation of renderer independence" requirement
- [ ] 4.4 Apply the MODIFIED delta to `openspec/specs/vue-adapter/spec.md`'s "Vue two-editor validation" requirement, renaming its title to "Vue neutral-composition validation" for consistency with the updated body prose
- [ ] 4.5 Update the prose in `openspec/specs/vue-adapter/spec.md`'s `## Purpose` section ("passes the shared two-editor validation" → references the new package/composition name) — a whole-file edit, not a delta operation, since Purpose text has no delta header
