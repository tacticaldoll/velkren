## Why

The repo has no CI: `AGENTS.md`'s Definition of Done (`npm run build`, `npm
test`, `npm run lint`, `npm run format:check`) is only ever run locally by
whoever is doing the work, so a PR can land without any of the four actually
having been run, and nothing catches it. This is the last gap identified
while orienting in the repo, and it is close to zero-prerequisite: the four
commands already exist, are already the project's own definition of "green,"
and just need to run automatically on every push and pull request against
`main`.

## What Changes

- Add a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs on
  `push` to `main` and on every `pull_request` targeting `main`.
- The workflow installs dependencies (`npm ci`) and runs the same four
  Definition of Done commands in order: `npm run build`, `npm test`,
  `npm run lint`, `npm run format:check`.
- Node version matches the range declared in the root `package.json`
  `engines` field; a single supported version is used in CI (the newest LTS
  in that range) rather than a full matrix, since the project does not yet
  have a stated multi-version support commitment.
- No change to any runtime package, `@velkren/core` contract, or OpenSpec
  capability — this is repository process tooling, not application behavior.

## Capabilities

### New Capabilities

<!-- none: this is infrastructure/process tooling, not a runtime capability -->

### Modified Capabilities

<!-- none: no existing capability's requirements change -->

## Impact

- **Code**: adds `.github/workflows/ci.yml` only. No source under `packages/`
  changes.
- **APIs**: none.
- **Dependencies**: none added to `package.json` — CI runs the workspace's
  existing scripts.
- **Non-goals**: no deployment, publishing, or release pipeline (that is a
  separate, larger decision outside this change's scope); no multi-OS or
  multi-Node-version matrix; no code-coverage reporting or badge.
