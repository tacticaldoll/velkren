## Why

`packages/two-editor-validation` started as a single-adapter validation fixture, but
`extract-neutral-composition` turned it into the **shared renderer-agnostic
composition** (`createEditorApp(renderer)`) that Solid, React, and Vue all mount to
prove the identical core composition is renderer-independent — "the gold-standard
neutrality proof." The name "two-editor" no longer names that role: "two" refers to
two editor *instances* (the isolation guarantee), not adapter count, and now that
three adapters share the fixture, readers reasonably but incorrectly read "two" as
"validated against two adapters." This change renames the package and its spec to
`neutral-composition-fixture`, which ties to the already-established "neutral
composition" vocabulary and keeps the spec's literal "fixtures, not a public UI API"
warning intact. Purely mechanical: no runtime contract, requirement, or behavior
changes.

## What Changes

- Rename `packages/two-editor-validation/` to `packages/neutral-composition-fixture/`;
  rename the package from `@velkren/two-editor-validation` to
  `@velkren/neutral-composition-fixture`.
- Update the `react-adapter` and `vue-adapter` package dependencies and imports from
  `@velkren/two-editor-validation` to `@velkren/neutral-composition-fixture`, and any
  `solid-adapter` reference the fixture itself holds.
- Update `tsconfig` project references that point at the old package path.
- Rename `openspec/specs/two-editor-validation/` to
  `openspec/specs/neutral-composition-fixture/`; update its own prose (title, any
  self-reference) to the new name.
- Update the `react-adapter` and `vue-adapter` spec prose that names the old package
  or calls the composition "the two-editor composition" / "two-editor validation" to
  instead name `@velkren/neutral-composition-fixture` / "the shared neutral
  composition." Requirement *behavior* is unchanged — only the identifier and prose
  wording change.
- No change to `BACKLOG.md`'s historical entries (`validate-two-editor-scenario`,
  `extract-neutral-composition`, etc.) — they describe what happened at the time and
  are not rewritten.

## Capabilities

### New Capabilities

- `neutral-composition-fixture`: the renamed identity for the shared
  renderer-agnostic two-editor composition and its `RendererTestHarness` test-drive
  surface; same requirements as the retired `two-editor-validation` capability, only
  the name changes.

### Modified Capabilities

- `two-editor-validation`: retired/superseded by `neutral-composition-fixture` — the
  spec moves to the new capability name rather than staying under the old one.
- `react-adapter`: requirement prose updated to name
  `@velkren/neutral-composition-fixture` / "the shared neutral composition" instead of
  `@velkren/two-editor-validation` / "the two-editor composition." No behavior change.
- `vue-adapter`: same prose update as `react-adapter`. No behavior change.

## Impact

- **Code**: `packages/two-editor-validation/**` moves to
  `packages/neutral-composition-fixture/**` (directory rename, `package.json` `name`
  field); `packages/react-adapter/package.json`, `packages/vue-adapter/package.json`,
  and any `tsconfig.json` `references` entries pointing at the old package path update
  to the new path/name; import specifiers (`from "@velkren/two-editor-validation"`)
  in `react-adapter` and `vue-adapter` test sources update to the new package name.
- **APIs**: no change to any exported symbol, `RendererPort`, or `@velkren/core`
  contract — `createEditorApp`, `RendererTestHarness`, and all fixture exports keep
  their existing names and signatures.
- **Dependencies**: dependency direction is unchanged (adapters depend on the fixture
  as a dev dependency; the fixture depends only on `@velkren/core`); only the package
  identifier changes.
- **Non-goals**: no new capability, no requirement change, no adapter behavior change,
  no change to any runtime contract. This is a rename/relocation only.
