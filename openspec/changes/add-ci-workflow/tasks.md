## 1. Workflow file

- [ ] 1.1 Create `.github/workflows/ci.yml` triggered on `push` to `main` and
      `pull_request` targeting `main`, with the `concurrency` group
      cancelling a superseded run for the same ref, running on a single
      `ubuntu-latest` runner (no OS matrix — tests already run against
      `happy-dom`, not a real browser)
- [ ] 1.2 Add the job: checkout, `actions/setup-node@v4` with the pinned
      Node version and `cache: npm`, `npm ci`, then `npm run build`,
      `npm test`, `npm run lint`, `npm run format:check` in that order

## 2. Verification

- [ ] 2.1 Push the branch and open a PR so the workflow actually runs on
      GitHub Actions; confirm all four steps pass in the Actions log
- [ ] 2.2 Run the same four commands locally to confirm the workflow's
      commands and order match the local Definition of Done exactly
