## 1. Primitive module

- [x] 1.1 Add `packages/core/src/reference-capability.ts` composing the runtime ownership token (`markRuntimeOwned` / `assertOwns`) with a module-local provenance `WeakMap`.
- [x] 1.2 Implement the issue function (a free function taking a `Runtime`, per the house idiom) returning `{ reference, handle }`: a public use-only reference and a private control handle, both runtime-owned and backed by one `createManagedResource` created with a `ManagedInstanceId` + `CanonicalClassId` so it carries a readable diagnostic identity and a tombstone.
- [x] 1.3 Implement `resolve`/`assert` that validates ownership (via `assertOwns`, first) then provenance then active status before returning the underlying authority — foreign/unowned handles yield `OwnershipError`, runtime-owned non-capabilities yield an explicit provenance error.
- [x] 1.4 Wire release through the private handle only, delegating to managed-lifecycle release (run-once, tombstoned, non-swallowed cleanup failures, and the failed-release failure remaining observable on later requests).
- [x] 1.5 Expose the readable diagnostic identity on the public reference such that it grants no operation.

## 2. Public surface

- [x] 2.1 Export the issue function, the public reference type, the private handle type, and the provenance error from `packages/core/src/index.ts`.
- [x] 2.2 Confirm no method or field on the public reference reaches the private handle, release, or any private runtime capability.

## 3. Tests

- [x] 3.1 Runtime issues a capability the owning runtime recognizes; an unowned object fails with an ownership error; a runtime-owned non-capability fails with a provenance error (spec: Runtime-issued capability with framework provenance).
- [x] 3.2 Owning runtime resolves successfully; a foreign runtime fails with an ownership error and gets no authority (spec: Owner-validated resolution).
- [x] 3.3 Private handle releases; public reference exposes no control operation and leaks no private authority (spec: Public and private handle split).
- [x] 3.4 Public reference exposes a readable diagnostic identity that grants no operation; a tombstone recording identity and released status survives release (spec: Readable diagnostic identity).
- [x] 3.5 Use/resolve after successful release is rejected as inactive; a repeated successful release runs no cleanup twice and resolves quietly; a throwing cleanup keeps its failure observable on later release requests (spec: Deterministic release through the managed lifecycle).
- [x] 3.6 Two runtimes issuing capabilities with the same canonical class identity cannot resolve or operate each other's; releasing one runtime's capability leaves the other's active and resolvable (spec: Cross-runtime isolation).

## 4. Definition of Done

- [x] 4.1 `npm run build`, `npm test`, `npm run lint`, and `npm run format:check` all pass from the project root.
- [x] 4.2 Confirm `event-endpoint.ts`, listener, and plugin code and their specs are unchanged by this change, and the primitive's tests import none of them.
