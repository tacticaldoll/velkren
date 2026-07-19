## 1. React adapter: anchor on the per-root container

- [x] 1.1 Stamp `PROJECTION_IDENTITY_ATTRIBUTE` on the `rootContainer` in `createRoot`, repair it on the `rootContainer` in `commit`, and read it from the `rootContainer` in `readIdentity`; point `elementForIdentity` at the `rootContainer`.
- [x] 1.2 Replace the synthetic-handler-prop interaction wiring with a native listener on the `rootContainer`: `registerInteraction` records interest per type and adds/reuses a native `addEventListener` on the container; drop `INTERACTION_HANDLER_PROPS` and the `isRoot` handler-prop block in `renderNode`; replace `snapshotReactEvent(SyntheticEvent)` with a native-event snapshot (like Solid's `snapshotNativeEvent`).
- [x] 1.3 In `removeRoot`, remove the container's native listeners; keep disposal idempotent.
- [x] 1.4 Migrate the `snapshotReactEvent` unit test (`packages/react-adapter/test/react-adapter.test.ts` imports + "snapshots a synthetic-like event") to the new native-event snapshot function.

## 2. SolidJS adapter: add a per-root container anchor

- [x] 2.1 In `createRoot`, create a `rootContainer` `div`, render the root content inside it, and append the container to the shared host; stamp/repair/read identity on the `rootContainer` (not the content element); point `elementForIdentity` at the `rootContainer`. Keep the shared-host option named `container` and the per-root anchor named `rootContainer`.
- [x] 2.2 Attach the interaction `addEventListener` to the `rootContainer` (instead of the content element); `removeRoot` removes it. Snapshot at the boundary as today.

## 3. Test migration (both adapters + validations)

- [x] 3.1 Update every test that reads the identity element or authored attributes: identity / `[data-velkren-root]` assertions read the container; authored-content assertions (`getAttribute("version")`, `role`, `class`/`for` translation, `tagName === "section"`) read the container's child (`firstElementChild`). Affected: `packages/react-adapter/test/*.test.ts`, `packages/two-editor-validation/test/two-editor.test.ts`, `packages/solid-adapter/test/*.test.ts`.
- [x] 3.2 Confirm all existing guarantees still pass unchanged in outcome: identity stable across commits, commit-repair, interaction delivery through the port, two-editor isolation / template-change / scoped disposal, and the React console-warning guard (native listener path logs nothing).
- [x] 3.3 Confirm `elementForIdentity` returns the container on both adapters and that the shared-host `container.children.length` (Solid) assertions still hold (2 then 1).

## 4. Definition of Done

- [x] 4.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root; confirm all pass and `@velkren/core` / render-root-projection are unchanged. Report any command that cannot run.
