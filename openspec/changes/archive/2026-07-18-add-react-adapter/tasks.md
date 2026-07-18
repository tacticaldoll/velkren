## 1. Package scaffold

- [x] 1.1 Create `packages/react-adapter/` (package.json, tsconfig, `src/index.ts` — plain `.ts`, no JSX, so no `jsx` tsconfig option) mirroring the solid-adapter layout; add `@velkren/core` (workspace) and pinned `react`/`react-dom` (18.x) deps plus `@types/react`/`@types/react-dom` dev deps.
- [x] 1.2 Give the adapter tests a package-scoped happy-dom environment via a per-file docblock (as solid-adapter's boundary test does); add `deps.inline: ["react", "react-dom"]` to vitest config if ESM interop requires it. Do NOT add `act`/`IS_REACT_ACT_ENVIRONMENT` (the tree holds no React state) and do NOT alter the core Node-only environment.

## 2. Port implementation

- [x] 2.1 Implement `createRoot`/`commit`/`removeRoot` via `react-dom/client`: create a container element attached under `document`, `ReactDOM.createRoot(container)`, render a `VelkrenTree` built with `React.createElement` from the `RenderNode` inside `flushSync`; `commit` re-renders via `flushSync`; `removeRoot` unmounts. Map `RenderNode` attributes to props with React translations (`class`→`className`, `for`→`htmlFor`) and give mapped children a `key`.
- [x] 2.2 Maintain identity imperatively: after each `flushSync`, read the mounted host node from the container and `setAttribute(PROJECTION_IDENTITY_ATTRIBUTE, identity)` (a re-render alone will not restore an out-of-band-removed attribute); implement `readIdentity` reading it back from the DOM. Never derive identity/ownership from the DOM.
- [x] 2.3 Implement `registerInteraction`: store `{type → deliver}` in a mutable per-root ref that the `createElement` handler props read at event time (no re-render on register); map the interaction-type string to the React synthetic handler prop for DOM-event-named types; produce an immutable snapshot (a `snapshotReactEvent`-style helper copying primitive fields) and never let the live node/synthetic event cross out. Ensure the ref is stable so re-rendered handlers (post-commit) read the same map.
- [x] 2.4 Track registrations per root and drop them on `removeRoot`; make `remove()` and repeated `removeRoot` idempotent; ensure no handler fires after unmount.
- [x] 2.5 Add adapter-local test affordances (NOT on the port): `elementForIdentity(identity)` and `simulateInteraction(identity, type)` (dispatch a native bubbling event on the identified node so React's delegated listener reports it).

## 3. Adapter tests (browser-like env)

- [x] 3.1 Core stays free of React/adapter (boundary test); the adapter satisfies the port incl. `registerInteraction`.
- [x] 3.2 Mount projects identity synchronously (present immediately after `createRoot`); commit repairs a removed identity attribute.
- [x] 3.3 Registration needs no re-render; a captured interaction (via `simulateInteraction`) delivers a snapshot through the port and, bound via `createInteractionBinding`, the runtime dispatches the bound event.
- [x] 3.4 A delivery-time failure (schema-invalid payload) surfaces through the runtime `onFailure` channel with no exception escaping the handler; unmount leaves no live handler or registration; repeated disposal is a no-op.

## 4. Cross-framework validation

- [x] 4.1 Compose the minimal component/template/event/layout set through the React adapter (a parallel React validation, not the Solid `createEditorApp`), driving via `simulateInteraction`/`elementForIdentity`; assert two editors have distinct identities, each emits its business semantic event through the interaction-binding contract, and destroying one releases only its owned roots/registrations while the other still emits.

## 5. Definition of Done

- [x] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root; confirm all pass, the react-adapter suite runs in its own browser-like env, and the core suite stays Node-only. Report any command that cannot run.
