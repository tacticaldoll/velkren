## 1. Extend the renderer port contract

- [ ] 1.1 Add `registerInteraction(root, type, deliver)` returning an `InteractionRegistration` (`{ remove(): void }`) to the `RendererPort` interface in `packages/core/src/renderer-port.ts`, typed so it carries only an `AdapterRoot`, a `string`, and a `(snapshot: JsonObject) => void` callback — no DOM, browser `Event`, or reactive types.
- [ ] 1.2 Add `"registerInteraction"` to `PORT_OPERATIONS` so `assertRendererPort` rejects a renderer that omits it.
- [ ] 1.3 Add unit tests: a conforming stub passes `assertRendererPort`; a renderer missing `registerInteraction` is rejected before projection.

## 2. Teach the fake renderer the input side

- [ ] 2.1 Implement `registerInteraction` on the in-memory fake renderer in `packages/core/src/fake-renderer.ts`, storing registrations per root and removing them on `removeRoot`.
- [ ] 2.2 Add a test-only helper to simulate an interaction that invokes the registered delivery callback with a supplied snapshot, in Node with no DOM.
- [ ] 2.3 Add fake-renderer tests: register → simulate → delivery fires; `removeRoot` drops the registration so a later simulate delivers nothing.

## 3. Interaction-binding core domain

- [ ] 3.1 Create `packages/core/src/interaction-binding.ts` with a runtime-owned contract that binds `(RootHandle, type)` to an `EventClass` and a `project(snapshot) => payload` function, asserting `runtime.assertOwns(root)` before registering through the port, and rejecting a second bind of an already-active `(root, type)` pair (no last-write-wins).
- [ ] 3.2 On the port's `deliver`, reject a snapshot that is not a plain JSON object, deep-freeze the accepted snapshot at the boundary, project the payload, and dispatch the bound EventClass through the existing event-dispatch contracts; surface schema-rejection as an explicit dispatch failure. Re-check the binding is still live at delivery time so a delivery racing release dispatches nothing.
- [ ] 3.3 Attach the port `registration.remove()` to the target root's managed cleanup so releasing the root drops the binding and blocks any late delivery. This requires `ProjectionRuntime.#createRoot` to retain an `addCleanup` capability (the controller or a bound function) in `RootState`, reached via a controlled accessor rather than by leaking `rootStates`.
- [ ] 3.4 Support registering a binding against a freshly projected root after a prior root was released.
- [ ] 3.5 Add error types for foreign-root binding, duplicate active binding, non-object snapshot, and invalid payload projection.

## 4. Wire binding into projection lifecycle and public surface

- [ ] 4.1 Ensure `ProjectionRuntime` exposes what interaction-binding needs to reach a root's adapter root/port, keeping `rootStates` encapsulation intact (extend via a controlled accessor, not by leaking internals).
- [ ] 4.2 Export the interaction-binding contract and its error types from `packages/core/src/index.ts`; keep binding internals and generic kernels unexported.

## 5. Core tests for interaction-binding

- [ ] 5.1 Bind a root to an EventClass, simulate an interaction through the fake renderer, and assert the semantic event is dispatched with the projected payload.
- [ ] 5.2 Assert a foreign-runtime RootHandle is rejected before any port registration, and a duplicate active `(root, type)` bind is rejected with no second registration.
- [ ] 5.3 Assert a payload the EventClass schema rejects fails dispatch with no partial event, and a non-object snapshot is rejected at the boundary with no dispatch.
- [ ] 5.4 Assert release stops delivery (including a delivery racing release), and registering against a freshly projected root after releasing the old one dispatches again.
- [ ] 5.5 Confirm the whole suite runs in Node with no DOM, browser `Event`, or reactive dependency.

## 6. SolidJS adapter input side

- [ ] 6.1 Implement `registerInteraction` on the Solid renderer in `packages/solid-adapter/src/index.ts` using its own event layer, invoking `deliver` with a `snapshotNativeEvent`-style immutable snapshot; never require an external listener on a queried element.
- [ ] 6.2 Track interaction registrations per root and dispose them in `removeRoot` alongside existing effects/listeners.
- [ ] 6.3 Remove `bindInteraction` from the public `SolidRenderer` surface (or reduce it to the port operation) so capture flows only through the port.
- [ ] 6.4 Update adapter tests: interaction capture delivers a snapshot through the port and the runtime dispatches the bound event; unmount leaves no effect, listener, or registration.

## 7. Two-editor validation through the port

- [ ] 7.1 Rewrite `packages/two-editor-validation/src/index.ts` to bind each editor's Button interaction to `editor.submitted` via the interaction-binding contract, deleting the `renderer.container.querySelector` + `addEventListener` path.
- [ ] 7.2 Make `activate()` drive the interaction through the adapter/port rather than dispatching a native DOM `Event`.
- [ ] 7.3 Confirm the binding survives `retemplate` (which commits to the same root) so the business event fires unchanged after a template swap — no re-registration and no root recreation.
- [ ] 7.4 Update validation tests: business event flows through binding, interaction isolation holds across two editors, and scoped disposal removes each editor's registrations.

## 8. Definition of Done

- [ ] 8.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root and confirm all pass; report any command that cannot run.
