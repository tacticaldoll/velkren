## 1. Component Definitions and Domain Types

- [x] 1.1 Add component identity allocation, component-domain error types, and internal provenance tagging shared with the existing helper-proven definition pattern.
- [x] 1.2 Implement helper-proven immutable `ComponentClass` definitions with portable canonical `component/<slug>` identity and an immutable `create` contract.
- [x] 1.3 Add a runtime-local ComponentClass registry over the internal typed-registration kernel, with owner-validated registration handles and duplicate-active rejection.
- [x] 1.4 Add tests for canonical identity, mutation resistance, forged/mutable-definition rejection, cross-runtime reuse producing independent registrations, and no generic kernel exposure.

## 2. Managed Component Creation

- [x] 2.1 Implement `ComponentFactory` over the central managed-instance factory boundary: active same-runtime registration validation, runtime-qualified instance ID, opaque ownership assignment, and lifecycle initialization before `create` runs.
- [x] 2.2 Implement creation-behavior failure handling with reverse-order temporary-resource cleanup, no instance publication, and a creation error preserving cause and cleanup failures.
- [x] 2.3 Add tests for creation from active registration, missing-registration failure, foreign-registration ownership rejection before `create`, and creation-behavior failure cleanup.

## 3. Logical Trees and Release Cascade

- [x] 3.1 Implement owner-validated attachment with single-parent enforcement, cross-runtime rejection, and acyclicity checks before any tree mutation, plus frozen tree-membership snapshots.
- [x] 3.2 Implement the reverse-attachment release cascade on the managed lifecycle: descendants first in deterministic order, parent detach, reference and scoped-endpoint revocation, and reverse-order owned-resource cleanup.
- [x] 3.3 Implement aggregate cascade failure reporting that still attempts every remaining release, plus idempotent repeated release and diagnostic tombstones.
- [x] 3.4 Add tests for attach, cross-runtime and cyclic/reparent rejection, deterministic descendant-first cascade, direct child release leaving parent active, aggregate cleanup failure, and repeated release.

## 4. Scopes and References

- [x] 4.1 Implement extend-only `Scope` bound to a subtree with a parent-chain resolver that returns the nearest provided entry and fails explicitly on unresolved names without selector, DOM, or global fallback.
- [x] 4.2 Implement frozen owner-validated `Reference` capabilities carrying framework provenance and target ownership, exposing only public contracts and rejecting imitations and foreign-runtime references.
- [x] 4.3 Implement reference revocation on target release and active-only access failing with a lifecycle error and diagnostic-only identity.
- [x] 4.4 Add tests for in-scope resolution, out-of-scope explicit failure, nested scope extension without parent mutation, valid reference use, imitation/foreign rejection, and reference-to-released-target failure.

## 5. Public Facade and Verification

- [x] 5.1 Compose one component domain into Runtime and add frozen public delegates for defining, registering, creating, attaching, scoping, and referencing components without changing existing event/listener/plugin behavior.
- [x] 5.2 Add intentional public exports for ComponentClass, component creation, instance handles, Scope, Reference, tree operations, and component errors while proving generic registries, factory kernels, scope storage, tree internals, and deferred capability-authority/template/renderer APIs remain unavailable.
- [x] 5.3 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, and `openspec validate --all`; resolve every failure.
- [x] 5.4 Perform adversarial review against project invariants, delta and living specs, ownership forgery, cross-runtime attach/reference, cyclic attachment, cascade failure, scope fallback, reference-after-release, public exports, Node.js isolation, and the deferred capability-authority boundary before sync and archive.
