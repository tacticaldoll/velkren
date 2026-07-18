## Context

`add-neutral-interaction-port` gave the binding a `#deliver` path that throws on a
non-object snapshot (`NonObjectSnapshotError`) or a schema-invalid payload
(`InvalidInteractionPayloadError`). Delivery is invoked from inside the adapter's
event callback: the SolidJS adapter calls `deliver` inside a real DOM
`addEventListener` handler (packages/solid-adapter/src/index.ts:108-112), and a
future React adapter would call it inside a synthetic-event handler. `dispatchEvent`
swallows listener throws (React routes handler errors to `window.onerror`, not
error boundaries). So the spec's "fails explicitly" is satisfied only by the fake
renderer, whose `simulateInteraction` calls `deliver` directly and lets the throw
propagate to the test — a behaviour no real adapter shares. The guarantee is
bound to the caller's exception-propagation context, which is the wrong place.

## Goals / Non-Goals

**Goals:**

- Move the delivery-time failure guarantee from "throws" to an owned, observable
  channel that holds regardless of the adapter's event-callback context.
- Never silently lose a delivery-time failure, even with no observer registered.
- Make the fake renderer faithful to real event-dispatch failure semantics so the
  contract can no longer pass on a behaviour absent in production.
- Preserve all existing diagnostic detail (the error classes) as failure causes.

**Non-Goals:**

- No renderer adapter work, no React, no two-editor changes.
- No change to bind-time throw semantics (foreign root, duplicate binding stay
  synchronous throws — application code calls `bind` directly).
- No `interaction-type` typed vocabulary.

## Decisions

### D1: The binding owns an observable failure channel; bind-time throws stay

`createInteractionBinding(runtime, projection, events, options?)` gains an optional
`onFailure(failure: InteractionFailure)` observer:

```
type InteractionFailureReason = "non-object-snapshot" | "invalid-payload" | "projection-error"
interface InteractionFailure { root: RootHandle; type: string; reason: InteractionFailureReason; cause: unknown }
```

`#deliver` no longer throws on delivery-time failures; it builds a typed
`InteractionFailure` and routes it to the channel, dispatching nothing. The four
reasons are each reachable: `non-object-snapshot` (isPlainObject rejection _and_
the distinct nested-non-JSON `createJsonSnapshot` rejection — two sub-paths kept as
separate test cases), `invalid-payload` (validateEventPayload rejection),
`projection-error` (the `project` callback throws — **net-new** try/catch, since
today `entry.project(snapshot)` runs uncaught), and `dispatch-error` (see D6).
**Why an observer**: it mirrors the existing
`EventTraceSink` / `ListenerLifecycleObserver` patterns, keeps the binding
framework-neutral, and avoids coupling failure reporting to the dispatch path it
is reporting on. Bind-time validation (`assertOwns`, duplicate `(root,type)`) keeps
its synchronous throw — `bind` is called by app code directly, so a throw there is
both catchable and correct. The spec states this bind-time-throw vs
delivery-time-channel split as an explicit principle so crispness does not rely on
per-scenario inference.

The liveness re-check gates failure surfacing, not just dispatch: `#deliver` checks
`entry.live && root.status === Active` **first**, before any snapshot/payload/
projection handling. A delivery for a released or dead binding surfaces **neither**
an event **nor** a failure — so a malformed interaction racing teardown does not
escalate error-reporting noise during normal release.

### D2: Never silently lost — default reporter, resolved at call time

With no `onFailure` registered, `#deliver` MUST NOT drop the failure silently and
MUST NOT re-throw synchronously into the swallowing event callback. It reports the
failure through a reporter-of-last-resort resolved at call time:
`globalThis.reportError` when it is a function (browsers and Web Workers expose it,
routing to the global error handler), otherwise `console.error`. **`reportError` is
NOT reliably present on the supported Node engines** (empirically absent on the test
host), so the `console.error` fallback is required, not optional — assuming
`reportError` exists would make the never-silent default itself throw and be
swallowed by the very event callback this change fixes. The reporter call is wrapped
so it can never throw out of `#deliver`. **Why not `queueMicrotask(() => { throw })`**:
a thrown microtask surfaces as `uncaughtException`, which the test runner's own
listener catches as a suite failure — untestable. Both `reportError` and
`console.error` are spy-able, so the no-observer path is asserted cleanly (the tests
force each branch deterministically). This satisfies Priority 2: a bare optional
observer whose absence means silence would reintroduce a quieter version of the bug.

### D3: The error classes become failure causes, not throws

`NonObjectSnapshotError` and `InvalidInteractionPayloadError` are retained and still
publicly exported; they become the `cause` on the corresponding `InteractionFailure`
(and remain the error passed to the default reporter when no observer exists), so no
diagnostic detail is lost and the existing public-boundary export test still holds.

### D4: The fake renderer mirrors real event-dispatch failure semantics

`FakeRenderer.simulateInteraction` currently calls `deliver` directly, so a throw
propagates to the test — unfaithful, because real adapters swallow it. Simulation
will invoke `deliver` so a throw does **not** propagate out of the simulation.
Consequently the failure-contract tests observe failure through `onFailure` (or the
`reportError` default), not by catching a throw. **Why**: a conformance double must
share the failure semantics of the thing it doubles; the original gap existed
precisely because it did not.

### D5: A throwing observer is contained

If a registered `onFailure` observer itself throws, the binding contains it (the
throw must not propagate into the adapter's event callback, which would re-create
the swallow bug). A throwing observer's error is routed to the same
default reporter (`globalThis.reportError` or `console.error`) as the no-observer path.

### D6: Dispatch-time async rejection is a delivery-time failure too

`this.events.dispatch(...)` returns a promise that can reject (missing registration,
`EventDispatchError`, trace failures). Today the binding discards it with
`void dispatch.then(settle, settle)` — a delivery-time failure that occurs after the
liveness check and is silently lost, contradicting the never-silent goal. The rework
routes that rejection through the same channel with reason `dispatch-error`
(cause = the rejection), so it reaches `onFailure` or `reportError`. **Why include
it**: the promise is discarded _here in the binding_, so from the binding's boundary
it is silently lost; routing it keeps the "never silently lose a delivery-time
failure" guarantee honest. The event domain's own trace semantics still apply
independently; this only stops the binding from swallowing the rejection.

A `dispatch-error` is asynchronous, so it can settle after its binding was
released. Consistent with the liveness gate, a `dispatch-error` whose binding is no
longer live when the rejection settles is suppressed (not surfaced), so a dispatch
racing teardown does not raise a late failure report; a live binding surfaces it
normally.

## Risks / Trade-offs

- **[Behaviour change: failure observable, not thrown]** Callers catching a
  delivery-time throw break. → Only in-repo tests; they move to `onFailure` /
  spying `reportError`. Documented BREAKING; bind-time throws unchanged.
- **[Test isolation of the default]** The no-observer default must be assertable
  without failing the suite, and host-independently (some hosts have
  `globalThis.reportError`, the test host does not). → Both branches are spy-able and
  need no uncaught throw; the tests force each branch deterministically (delete
  `globalThis.reportError` and spy `console.error`; and separately set it to a spy to
  prove call-time selection). The observer path registers `onFailure` and asserts on
  it.
- **[Double-report]** A failure could reach both the observer and the default
  reporter if wired wrongly. → Exactly one sink fires per failure: observer if
  present, else the default reporter; a throwing observer is the only case that
  escalates to the default reporter.

## Migration Plan

In-repo only; no released consumers.

1. Add `onFailure` + `InteractionFailure` to interaction-binding; run the liveness
   check first, then route the four delivery-time failures (`non-object-snapshot`,
   `invalid-payload`, `projection-error`, `dispatch-error`) to the channel;
   implement the `reportError` never-silent default and the contained-observer
   rule; keep bind-time throws and the exported error classes (now as causes).
2. Make the fake renderer's `simulateInteraction` swallow the delivery throw.
3. Update core tests: assert delivery-time failures via `onFailure` (reason +
   cause) and the no-observer `reportError` path; keep bind-time throw assertions.
4. Run the Definition of Done; sync the interaction-binding and
   render-root-projection corrections; archive.

Rollback is a straight revert; no persisted state.

## Open Questions

- Should a richer default sink (e.g. a runtime diagnostic transcript) replace
  `globalThis.reportError` later? Deferred; `reportError` is the minimal, spy-able
  never-silent default now.
