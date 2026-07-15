## 1. Endpoint Identity and Authority

- [x] 1.1 Add internal endpoint identity allocation, EventChannel, endpoint lifecycle phases, strict-JSON lifecycle record types, and domain-specific errors.
- [x] 1.2 Implement managed endpoint state with separate frozen public and private provenance-bearing capabilities, runtime ownership checks, active publication tracking, and no ID lookup.
- [x] 1.3 Implement transactional asynchronous caller-created endpoint creation and idempotent non-blocking release that prevents new work, removes membership, permits an already executing callback to finish, and aggregates reverse-order cleanup.
- [x] 1.4 Add tests for capability separation, structural imitation, foreign runtime rejection before behavior, default endpoint permanence, lifecycle observation and creation rollback, release from inside a callback without deadlock, concurrent publication, and repeated release.

## 2. ListenerClass and Middleware Definitions

- [x] 2.1 Implement helper-proven immutable middleware definitions with awaited before undefined-or-false and after undefined-only return contracts.
- [x] 2.2 Implement helper-proven immutable ListenerClass definitions with `listener` identity, exactly one EventClass, one callback, and copied ordered middleware.
- [x] 2.3 Implement ListenerExecutionError and the onion executor with entered-hook tracking, false short-circuiting, reverse after unwinding, and primary/after failure preservation.
- [x] 2.4 Add tests for definition provenance and mutation resistance, invalid EventClass/middleware, successful onion order, before/callback false, invalid before/after returns, thrown hooks, continued unwind, and combined failures.

## 3. Listener Registration and Managed Instances

- [x] 3.1 Add a listener-specific runtime registry adapter and protected ListenerClassRegistration wrapper without exposing generic definition or release capabilities.
- [x] 3.2 Implement ListenerFactory creation from active same-runtime registrations and authorized endpoint channels with monotonic endpoint installation sequence and atomic rollback including installed-observer failure.
- [x] 3.3 Implement managed ListenerInstance active-only context capabilities, registration/endpoint retention, membership removal, live-reference clearing, and idempotent release.
- [x] 3.4 Add tests for reusable definitions, runtime isolation, registration dependencies, public/private installation authority, installation ordering, rollback, endpoint-owned reverse cleanup, and release retention clearing.

## 4. Endpoint Reaction and Event Dispatch Integration

- [x] 4.1 Implement immutable per-publication matching listener snapshots, released-before-turn skipping, and serial awaited execution in installation order.
- [x] 4.2 Add a listener reaction port to EventDispatcher so reaction occurs after created trace and before completed trace while preserving pre-instance failure and guaranteed release behavior.
- [x] 4.3 Compose the permanent default public endpoint into EventRuntime, preserve `dispatch()` compatibility, and add explicit public/private endpoint publication operations.
- [x] 4.4 Add tests for no-listener compatibility, channel isolation, asynchronous order, installation during publication, release before turn, false short-circuit, reaction failure aggregation, reentrancy, and trace phase order.

## 5. Managed Relayers

- [x] 5.1 Implement relayer creation as a ListenerInstance callback with same-runtime source/target authority validation before mapper execution or installation.
- [x] 5.2 Implement detached snapshot mapping into a newly dispatched target EventInstance without forwarding source instance, raw state, traces, errors, or native-event semantics.
- [x] 5.3 Implement internal nested publication depth propagation and an explicit bounded relay-cycle error with guaranteed finalization.
- [x] 5.4 Add tests for public/private relays, independent target identity/snapshot/trace/release, async mapping, cross-runtime rejection, mapper failure, nested relays, cycle bounds, and complete cleanup.

## 6. Public Facade and Verification

- [x] 6.1 Add EventRuntime listener definition/register/replace/unregister/listen/relay and endpoint APIs with exactly-once listener-domain composition and frozen public delegates.
- [x] 6.2 Add intentional public exports for endpoint, listener, middleware, relay, channel, lifecycle record, and error contracts while proving generic reaction/storage kernels and deferred browser/component/plugin APIs remain unavailable.
- [x] 6.3 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, `openspec validate --all`, and offline dependency audit; resolve every failure.
- [x] 6.4 Perform adversarial review against project invariants, living and delta specs, Node.js isolation, capability forgery, callback retention, concurrent release, relay cycles, public exports, and deferred scope before sync and archive.
