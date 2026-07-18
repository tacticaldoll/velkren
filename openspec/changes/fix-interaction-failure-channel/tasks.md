## 1. Failure channel in the binding

- [ ] 1.1 Add `InteractionFailureReason` (`"non-object-snapshot" | "invalid-payload" | "projection-error" | "dispatch-error"`) and `InteractionFailure` (`{ root, type, reason, cause }`) plus an optional `onFailure` observer parameter to `createInteractionBinding` in `packages/core/src/interaction-binding.ts`.
- [ ] 1.2 Reorder `#deliver` so the liveness check (`entry.live && root.status === Active`) runs FIRST — before any snapshot/payload/projection handling — so a delivery for a released/dead binding surfaces neither event nor failure.
- [ ] 1.3 Route delivery-time failures to the channel, dispatching nothing: non-object → `non-object-snapshot` (cause `NonObjectSnapshotError`, keeping the two distinct sub-paths: `isPlainObject` and nested-non-JSON `createJsonSnapshot`); schema-invalid payload → `invalid-payload` (cause `InvalidInteractionPayloadError`); a throwing `project` callback → `projection-error` (net-new try/catch around `entry.project`); and route the `events.dispatch(...)` promise rejection → `dispatch-error` (replace `void dispatch.then(settle, settle)` so the rejection is reported, not discarded), re-checking liveness when the rejection settles so a dispatch racing release is suppressed rather than raising a late failure. Do not throw synchronously out of `#deliver`.
- [ ] 1.4 Implement the never-silent default via a reporter-of-last-resort resolved at call time: `globalThis.reportError` when it is a function, otherwise `console.error` (the fallback is required — `reportError` is absent on the supported Node engines). Wrap the reporter call so it never throws out of `#deliver`; never re-throw synchronously into the delivery callback.
- [ ] 1.5 Contain a throwing observer: catch it and route to the same default reporter so it cannot re-enter the adapter's event callback. Also route any throw from `validateEventPayload` (not just `EventPayloadValidationError`) to the channel so `#deliver` never throws synchronously.
- [ ] 1.6 Keep bind-time throws (foreign root, duplicate `(root,type)`) synchronous. Keep `NonObjectSnapshotError` / `InvalidInteractionPayloadError` exported (now used as causes).
- [ ] 1.7 Export `InteractionFailure` / `InteractionFailureReason` (and the observer option type) from `packages/core/src/index.ts`; keep internals unexported.

## 2. Faithful fake renderer

- [ ] 2.1 In `packages/core/src/fake-renderer.ts`, make `simulateInteraction` invoke the delivery callback so a throw does NOT propagate out of the simulation (mirror real event dispatch).

## 3. Tests (Node-only, on the fake)

- [ ] 3.1 Replace the throw-based delivery-time assertions: assert each reason surfaces one typed failure (reason + cause) through `onFailure` and dispatches nothing — keeping both `non-object-snapshot` sub-paths (primitive/array via `isPlainObject`; nested live-reference via `createJsonSnapshot`), plus `invalid-payload`, `projection-error` (throwing projection), and `dispatch-error` (a bound event whose dispatch rejects, e.g. an unregistered EventClass).
- [ ] 3.2 Assert the no-observer path host-independently: force the fallback (save + `delete globalThis.reportError`, restore after) and assert `console.error` is called once with an Error whose cause is the original, dispatching nothing; and separately set `globalThis.reportError` to a spy and assert the call-time selection uses it.
- [ ] 3.3 Assert a throwing `onFailure` observer is contained (does not propagate out of `simulateInteraction`) and routes to the default reporter.
- [ ] 3.4 Assert `simulateInteraction` swallows a delivery-callback throw (does not propagate), and that a delivery racing release surfaces neither event nor failure (no `reportError`, no dispatch).
- [ ] 3.5 Keep bind-time throw assertions (foreign root, duplicate binding); extend the public-boundary export test to assert `InteractionFailure` / `InteractionFailureReason` are exported alongside the retained error classes.

## 4. Definition of Done

- [ ] 4.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root; confirm all pass with the suite Node-only. Report any command that cannot run.
