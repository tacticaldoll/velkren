## Why

The `interaction-binding` spec requires that a rejected snapshot or a
schema-invalid payload "fails explicitly", and the implementation delivers that
by throwing out of the delivery callback. But delivery runs inside the
framework's event callback — a DOM listener, and (for a future React adapter) a
synthetic-event handler — and both browsers and React swallow exceptions thrown
there. So "fails explicitly" holds only on the in-memory fake renderer, whose
`simulateInteraction` calls the delivery callback directly and propagates the
throw — behaviour no real adapter shares. The requirement, as written, is
unsatisfiable on any real adapter, and the unfaithful fake let it pass its tests.
This is a latent correctness defect from `add-neutral-interaction-port`, not an
enhancement: a runtime-boundary guarantee is currently proven only by a test
double whose failure semantics do not match production.

This change is deliberately scoped to the core correction alone — it is fully
provable on the fake renderer in Node — so it can land independently of, and
before, a second renderer adapter that exercises the same contract.

## What Changes

- **Own an observable interaction failure channel.** `createInteractionBinding`
  gains an optional `onFailure` observer. Delivery-time failures — a non-object
  snapshot, a schema-invalid projected payload, a throwing projection, or a
  rejected event dispatch — SHALL surface a typed failure (`root`, interaction
  type, a reason of `non-object-snapshot` / `invalid-payload` / `projection-error`
  / `dispatch-error`, and the underlying cause) through that owned channel and
  dispatch nothing, instead of relying on a throw propagating out of the adapter's
  event callback. The liveness check gates failure surfacing too: a delivery for a
  released or dead binding surfaces neither an event nor a failure.
- **Never silently lose a failure.** With no observer registered, a delivery-time
  failure SHALL be reported through `globalThis.reportError` (so it is visible and
  never lost, and spy-able in tests), and never propagated synchronously back into
  the adapter's swallowing event callback. Bind-time misuse (foreign root,
  duplicate binding) keeps its synchronous throw — that is called directly by
  application code, not from an event callback.
- **Make the fake renderer faithful.** Its `simulateInteraction` SHALL mirror real
  event-dispatch semantics by not propagating a throw out of the delivery
  callback, so the failure contract can only be observed through the failure
  channel — closing the gap that let a behaviour absent in production turn tests
  green.
- The existing `NonObjectSnapshotError` and `InvalidInteractionPayloadError` are
  retained as the `cause` carried on a typed failure (still publicly exported),
  so no diagnostic detail is lost. **BREAKING** for any caller that relied on
  catching a delivery-time throw (only in-repo tests, updated here).

## Capabilities

### New Capabilities

<!-- none: this is a correction to existing capabilities -->

### Modified Capabilities

- `interaction-binding`: delivery-time failures surface through an owned,
  observable, never-silent failure channel instead of a thrown exception a real
  adapter's event callback would swallow; a new failure-channel requirement is
  added and the snapshot-boundary and event-binding requirements are corrected.
- `render-root-projection`: the in-memory fake renderer's interaction simulation
  no longer propagates a delivery-callback throw, matching real event-dispatch
  semantics so the failure contract is proven through the observable channel.

## Impact

- **Code**: `packages/core/src/interaction-binding.ts` (failure channel +
  delivery-time routing + never-silent default), `packages/core/src/fake-renderer.ts`
  (faithful simulate), `packages/core/src/index.ts` (failure-channel exports),
  and the core interaction-binding / fake-renderer tests.
- **APIs**: interaction-binding delivery-time failure becomes observable rather
  than thrown — a behaviour change for callers catching a delivery-path throw
  (only in-repo tests). Bind-time throws unchanged.
- **Dependencies**: none.
- **Non-goals**: no renderer adapter work, no React, no two-editor changes, no
  `interaction-type` vocabulary change; those are separate changes (the React
  adapter depends on this one).
