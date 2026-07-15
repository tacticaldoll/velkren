## 1. Project Contract and Workspace

- [x] 1.1 Replace starter metadata in `README.md`, `PROJECT.md`, and package metadata using the design's Project Contract Content; verify every declared section is represented, no placeholder instructions remain, and no compatibility claim is introduced.
- [x] 1.2 Create `BACKLOG.md` from the design's Backlog Contract, mark `initial-project-shape` active, keep every later item dependency-correct, and verify no item duplicates this change's task checklist.
- [x] 1.3 Configure npm workspaces, commit the lockfile, and create the initial `@velkren/core` package with framework-independent TypeScript entry points.
- [x] 1.4 Add build, test, lint, and formatting tooling so all four documented Definition of Done commands execute successfully from the repository root.

## 2. Identity and Ownership

- [x] 2.1 Implement and test validation and canonical formatting for runtime IDs, local class slugs, canonical class IDs, qualified registration IDs, and qualified managed-instance IDs.
- [x] 2.2 Implement runtime creation with caller-supplied or generated readable IDs and distinct opaque ownership identities; test that equal readable IDs do not share ownership.
- [x] 2.3 Implement owner-bearing handles and pre-mutation ownership validation; test successful same-runtime operations and rejected cross-runtime operations.

## 3. Managed Lifecycle

- [x] 3.1 Implement the managed lifecycle state machine and reverse-order resource stack with idempotent release behavior.
- [x] 3.2 Implement released-object guards and immutable diagnostic tombstones that retain identity/status data without active managed references.
- [x] 3.3 Add Node.js tests proving cleanup order, cleanup-failure aggregation, repeated release behavior after success and failure, post-release rejection, and absence of DOM or renderer dependencies.

## 4. Typed Definitions and Registrations

- [x] 4.1 Implement an internal kind-specific definition helper that validates local slugs, automatically creates immutable canonical class IDs, and rejects handwritten kind prefixes without adding it to the public package export map.
- [x] 4.2 Implement the internal runtime-owned typed registry with independent cross-runtime registrations, kind validation, deterministic resolution, and duplicate rejection.
- [x] 4.3 Implement explicit registration replacement with runtime-assigned revisions and protected replacement/unregister behavior that rejects live dependents and leaves reusable definitions unchanged.
- [x] 4.4 Add tests covering typed-registry isolation, equal slugs across kinds, duplicate registration, kind mismatch, revision history, unregister behavior, and rejection without mutation when live dependents exist.

## 5. Central Factory Boundary

- [x] 5.1 Implement an internal test factory that creates managed instances only from active same-runtime registrations and initializes identity, ownership, and lifecycle before definition behavior runs.
- [x] 5.2 Add tests proving successful factory creation and failure without publishing an instance for missing, released, foreign, or definition-creation-failing registrations, including reverse cleanup and aggregated creation errors.

## 6. Verification

- [x] 6.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`; resolve all failures and record any unavoidable environment limitation.
- [x] 6.2 Review the public core exports against the delta specs and design, ensuring the generic registration kernel, test kinds, event, plugin, loader, DOM, layout, SolidJS, and UI APIs have not leaked into this change.
