## 1. Namespace Identity and Matching

- [x] 1.1 Implement internal validated root and dot-segment namespace identities plus framework-derived runtime-qualified loader IDs.
- [x] 1.2 Implement segment-aware namespace containment, depth ordering, and deterministic deepest-ancestor selection helpers.
- [x] 1.3 Add tests for invalid namespaces, boundary-safe matching, root precedence, deepest selection, and equal readable runtime IDs without shared ownership.

## 2. Managed Typed Loader Registry

- [x] 2.1 Implement immutable kind-specific loader definitions and runtime-owned managed loader registrations without adding loader symbols to the public export map.
- [x] 2.2 Implement duplicate rejection, kind and ownership validation, deterministic selection, runtime-assigned replacement revisions, and idle unregister.
- [x] 2.3 Track in-flight loads per loader and reject replacement or unregister without mutation while any selected load remains active.
- [x] 2.4 Add tests covering loader-registry isolation, duplicate namespaces, kind mismatch, deepest and root selection, protected lifecycle operations, callback clearing, and reusable loader definitions.

## 3. Atomic Class Registration Batches

- [x] 3.1 Add an internal typed-registry batch operation that validates the complete contribution before reserving revisions or publishing registrations.
- [x] 3.2 Implement off-map managed registration initialization, synchronous all-at-once publication, and reverse rollback with aggregated initialization and cleanup failures.
- [x] 3.3 Add tests for successful deterministic batch revisions, intra-batch duplicates, active conflicts, kind mismatch, rollback, and zero partial visibility.

## 4. Explicit Namespace Resolver

- [x] 4.1 Implement explicit async loading that returns active registrations without loader invocation and leaves synchronous `resolve()` side-effect free.
- [x] 4.2 Implement per-canonical-class in-flight promise deduplication, independent different-class loads, guarded in-flight cleanup, and retry after failure.
- [x] 4.3 Implement one-time deepest-loader selection with no shallower fallback and explicit errors for no match, callback failure, and missing requested class.
- [x] 4.4 Materialize bounded staged contributions and validate ownership context, kind, namespace containment, uniqueness, requested-class presence, and active conflicts before atomic commit.
- [x] 4.5 Add concurrency and failure tests proving same-class deduplication, different-class independence, retry, no fallback, atomic multi-definition publication, and unchanged state on every invalid contribution.

## 5. Verification and Governance

- [x] 5.1 Add Node.js and public-entry tests proving the loader kernel introduces no DOM, renderer, plugin, event, domain-factory, or public generic loader API.
- [x] 5.2 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, `openspec validate --all`, and dependency audit; resolve every failure.
- [x] 5.3 Review implementation and exports against the proposal, design, living specs, and delta spec, then record any intentional limitation before sync and archive.
