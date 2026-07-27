## Context

`package.json` already declares the full Definition of Done as four npm
scripts (`build`, `test`, `lint`, `format:check`) and an `engines` range
(`^20.19.0 || ^22.13.0 || >=24.0.0`). `package-lock.json` is committed and
workspace-consistent (verified during `rename-neutral-composition-fixture`,
which required a clean reinstall and confirmed the lockfile regenerates
cleanly). There is no `.github/` directory yet. This change only needs to
wire GitHub Actions to run what already exists — no new tooling, script, or
dependency.

## Goals / Non-Goals

**Goals:**

- Every push to `main` and every pull request targeting `main` runs `npm run
build`, `npm test`, `npm run lint`, and `npm run format:check`, in that
  order, and the PR shows a required status check reflecting the result.
- Use `npm ci` (not `npm install`) so CI installs exactly what
  `package-lock.json` pins, and fails loudly if the lockfile and
  `package.json` ever drift.
- Keep the workflow to a single job, single Node version, single OS —
  matching the project's current lack of a stated multi-environment support
  commitment.

**Non-Goals:**

- No build/test matrix across Node versions or operating systems.
- No deployment, publish, or release step of any kind.
- No code-coverage collection, badge, or reporting service.
- No branch-protection rule configuration (enabling "required" status checks
  in GitHub's branch protection settings is a repository-settings action
  outside this change's file-based scope; this change only makes the check
  available to require).

## Decisions

- **Trigger**: `on: push: branches: [main]` and
  `on: pull_request: branches: [main]`. Covers both a direct push (should not
  happen per `AGENTS.md`, but CI should still catch it) and every PR against
  `main`.
- **Runner**: `ubuntu-latest`, single OS. The project has no browser-specific
  CI need — tests already run against `happy-dom`, not a real browser.
- **Node version**: pin one concrete version from the `engines` range rather
  than a matrix. Use the newest LTS covered by the range at the time of
  writing, via `actions/setup-node@v4` with `node-version-file` pointed at
  nothing (no `.nvmrc` exists) — instead pass an explicit `node-version`
  matching the workspace's tested version, and set `cache: npm` so
  `actions/setup-node` caches the npm store keyed on `package-lock.json`.
- **Install command**: `npm ci`, not `npm install` — reproducible, and fails
  fast if `package-lock.json` is out of sync with `package.json` (the exact
  failure mode `extract-neutral-composition`'s prior lockfile drift would
  have been caught by, had CI existed then).
- **Step order**: `build` → `test` → `lint` → `format:check`, mirroring the
  order `AGENTS.md`'s Definition of Done already lists them in. `build` runs
  first because `test` (Vitest) and the workspace's TypeScript project
  references assume `tsc -b` has produced current output for cross-package
  type-checking.
- **Concurrency**: set `concurrency: { group: ci-${{ github.ref }},
cancel-in-progress: true }` so a fast follow-up push cancels a superseded
  run rather than queuing both to completion.
- **Workflow file name**: `.github/workflows/ci.yml` — the conventional,
  discoverable name; no other workflow exists to collide with it.

## Risks / Trade-offs

- **Pinned single Node version drifts from `engines`** over time as new
  Node releases ship → Mitigation: the `engines` field remains the source of
  truth; bumping the CI-pinned version is a small, low-risk follow-up change
  whenever it drifts, not a reason to add a matrix now.
- **No required-status-check enforcement without a manual GitHub setting** →
  Mitigation: called out explicitly as a non-goal; the workflow existing is
  the prerequisite, enabling "required" is a one-time manual repository
  setting the user can flip once this merges.
- **`npm ci` requires the lockfile to already be in sync** → this is the
  intended behavior (catch drift), not a risk to mitigate.
- **`openspec validate add-ci-workflow` (run standalone, mid-lifecycle)
  errors** with "Change must have at least one delta. No deltas found." —
  the CLI's standalone `validate` unconditionally requires at least one delta
  spec, even for a change that legitimately has zero capability changes.
  This is a known CLI limitation for infrastructure/tooling changes, not a
  defect in this proposal → Mitigation: none needed on the archive path,
  since `openspec archive --skip-specs` only runs delta validation when a
  `specs/` directory with delta headers is actually present, so archiving
  this change with `--skip-specs` succeeds cleanly. Do not try to satisfy
  standalone `validate` by inventing a capability spec that doesn't
  correspond to any real requirement.

## Migration Plan

Additive only — a new file under `.github/workflows/`. No existing file
changes, no rollback beyond deleting the file or disabling the workflow in
GitHub's UI.

## Open Questions

None outstanding.
