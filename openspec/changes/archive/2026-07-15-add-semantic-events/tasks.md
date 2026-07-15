## 1. Strict JSON Snapshot Kernel

- [x] 1.1 Define public strict JSON value types and internal normalization errors, path diagnostics, and conservative depth/node/string/byte limits.
- [x] 1.2 Implement descriptor-based traversal that does not invoke ordinary getters or `toJSON` and rejects accessors, symbols, sparse arrays, cycles, unsupported primitives, non-finite numbers, and observably non-plain objects.
- [x] 1.3 Implement deterministic schema-order/nested-key serialization, detached cloning, deep freezing, and fresh trace-copy creation from canonical text.
- [x] 1.4 Add tests for every accepted JSON primitive/container, every rejected data shape, deterministic ordering, shared-reference copying, cycle rejection, limits, detachment, and deep immutability.

## 2. EventClass and Closed Schemas

- [x] 2.1 Implement helper-proven immutable EventField descriptors for required and optional synchronous validation.
- [x] 2.2 Implement public EventClass definition with `event` kind identity, validated slug, immutable schema, conservative field-name grammar, and reserved-name rejection.
- [x] 2.3 Implement closed-schema payload validation with unknown/missing-field rejection and field/path-aware wrapping of predicate rejection or exception.
- [x] 2.4 Add tests for EventClass identity/provenance, schema mutation resistance, valid optional fields, unknown/missing fields, invalid predicates, thrown predicates, and validation-before-publication.

## 3. Managed EventInstance and Factory

- [x] 3.1 Implement public EventPhase, EventInstance active-only accessors, runtime ownership, qualified identity, and WeakMap-held raw source, snapshot, and canonical text.
- [x] 3.2 Implement EventFactory creation from active same-runtime EventClass registrations with ownership checks before validation, optional adoption of a preallocated dispatch ID, and rollback after allocation failure.
- [x] 3.3 Implement idempotent release cleanup that clears raw source, snapshot, canonical text, phase capabilities, and live EventClass references while preserving only diagnostic tombstone data.
- [x] 3.4 Add tests for successful creation, detached snapshots, foreign/missing/released registrations, validation failure without publication, rollback, cleanup aggregation, active-only access, retention clearing, and repeated release.

## 4. Trace and Programmatic Dispatch

- [x] 4.1 Implement immutable strict-JSON EventTraceRecord and transcript builders with scalar identity, phase, sequence, timestamps, safe outcome diagnostics, and detached snapshot copies.
- [x] 4.2 Implement an always-present no-op sink plus optional ordered asynchronous trace sink execution without cancellation authority.
- [x] 4.3 Implement pre-instance diagnostic ID allocation, programmatic dispatch phase transitions, guaranteed conditional release/final trace, and one EventDispatchError preserving transcript, primary, trace, and release failures.
- [x] 4.4 Add tests for successful and failed phase order, monotonic sequence, async sink ordering, sink failure, release failure, combined failures, safe error conversion, transcript immutability, and absence of live references.

## 5. Public Event Runtime Facade

- [x] 5.1 Implement exactly-once `createEventRuntime` composition over one Runtime with event-specific register, replace, unregister, resolve/load, create, and dispatch operations.
- [x] 5.2 Implement event-specific namespace loader definitions and registration that adapt only helper-proven EventClass contributions to the internal typed loader kernel.
- [x] 5.3 Add tests for runtime isolation, active resolution before loading, deterministic missing-class loading, atomic invalid-loader rejection, protected registration lifecycle, and reusable EventClass/loader definitions.
- [x] 5.4 Add intentional public exports for EventClass/schema/runtime/factory/instance/phase/trace/error contracts while proving generic kernels and deferred listener/browser/plugin/UI APIs remain unavailable.

## 6. Verification and Governance

- [x] 6.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, `openspec validate --all`, and dependency audit; resolve every failure.
- [x] 6.2 Perform adversarial review against project invariants, living specs, delta spec, design, Node.js isolation, lifecycle retention, public exports, and deferred scope before sync and archive.
