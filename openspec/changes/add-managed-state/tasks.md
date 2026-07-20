## 1. State domain and handle

- [x] 1.1 Add `packages/core/src/state-runtime.ts` with `createStateRuntime(runtime): StateRuntime`, guarded one-per-runtime by a `WeakMap<Runtime, StateRuntime>` (throw `DuplicateStateRuntimeError` on a second).
- [x] 1.2 Implement `StateRuntime.create<T extends JsonValue>(initial: T): StateHandle<T>` minting a managed resource via `createManagedResource(runtime, createManagedInstanceId(runtime.id, "state", "cell-N"), createCanonicalClassId("state", "cell"))`, with a per-runtime cell sequence.
- [x] 1.3 Define `StateHandle<T>` extending the managed object (`id`, `classId`, `status`, `tombstone`, `assertActive`, `release`) plus `read()`, `update(next)`, and `observe(observer)`; it is runtime-owned (via the managed controller) so another domain can `assertOwns` it.

## 2. Value, update, and observation

- [x] 2.1 Store the value as frozen strict JSON via `createJsonSnapshot`; `create` and `update` normalize/freeze; `read()` returns the frozen value; a non-JSON value throws `InvalidStateValueError` leaving the prior value unchanged and notifying no observer.
- [x] 2.2 Implement `update(next | (previous) => next)`: compute the next value (apply an updater to the current frozen value), snapshot+freeze, store as authoritative BEFORE notifying, then notify observers synchronously in registration order with the new value.
- [x] 2.3 Implement `observe(observer)` returning `{ remove() }`; registration/removal notifies nothing by itself; removal stops only that observer.
- [x] 2.4 Notify observers with a plain owned callback list — no renderer/reactive type in any signature. A throwing observer does not stop the rest; collect throws and surface an `AggregateError` after notifying all.

## 3. Lifecycle and ownership

- [x] 3.1 Add cleanups so `release()` clears the observer list and drops the held value; rely on the managed controller for idempotent release; `read`/`update`/`observe` call `assertActive`.
- [x] 3.2 The handle is runtime-owned (`createManagedResource` marks it), so a consuming domain rejects a foreign handle via `runtime.assertOwns`; a test asserts `runtime.owns(handle)`.

## 4. Exports and tests

- [x] 4.1 Export `createStateRuntime`, `StateRuntime`, `StateHandle`, `StateSubscription`, `StateObserver`, `DuplicateStateRuntimeError`, and `InvalidStateValueError` from `packages/core/src/index.ts`.
- [x] 4.2 Add a Node-only core test suite (11 tests) covering: one-domain-per-runtime; create/read frozen value; update stores + notifies; updater-function form; non-JSON rejected without effect (update and initial); observe/remove; no-notify-on-subscribe; observer-throw containment + surfaced failure + state still updated; release clears observers and makes operations active-only; idempotent release.
- [x] 4.3 Definition of Done from the project root passes: `npm run build`, `npm test` (379 tests), `npm run lint`, `npm run format:check`.
