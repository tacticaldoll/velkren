## 1. Core: RendererPort and ProjectionRuntime

- [x] 1.1 Add `mountChild(parent: AdapterRoot, anchor: string, identity: string, node: RenderNode): AdapterRoot` to the `RendererPort` interface in `packages/core/src/renderer-port.ts`; add `"mountChild"` to `PORT_OPERATIONS`
- [x] 1.2 Refactor `ProjectionRuntime`'s private `#createRoot` in `packages/core/src/projection-runtime.ts` to accept a callback that produces the `AdapterRoot` (`(identity) => AdapterRoot`), so `mount` and the new `mountChild` share the managed-resource/`rootStates`/cleanup-wiring logic
- [x] 1.3 Add `mountChild(parent: RootHandle, anchor: string, instance: ComponentInstance, plan: RenderPlan): Promise<Projection>` to `ProjectionRuntime`: assert ownership/active on both parent and instance, create each named root via the refactored helper calling `renderer.mountChild(parentAdapterRoot, anchor, identity, node)`, build the `Projection` exactly as `mount` does, and additionally register `() => projection.release()` on the **parent root's** cleanup chain (via the existing internal `RootState.addCleanup`) so releasing the parent cascades to the child
- [x] 1.4 Implement `mountChild` in `packages/core/src/fake-renderer.ts`: create a new `FakeRoot` tracked alongside existing roots, recording which parent/anchor it was mounted under for test inspection
- [x] 1.5 Update the two existing inline minimal `RendererPort` stubs that will now fail `assertRendererPort`/typecheck once `mountChild` is required: `packages/core/test/projection-runtime.test.ts`'s "accepts a conforming stub including registerInteraction" fixture, and `packages/core/test/interaction-binding.test.ts`'s inline `const port: RendererPort = {...}` literal (~line 483) — add a minimal `mountChild` to each

## 2. Solid adapter

- [x] 2.1 Change `SolidView` to `(props: JsonObject, context: SolidViewContext) => HTMLElement`, where `SolidViewContext` exposes `registerAnchor(name: string, element: HTMLElement): void`
- [x] 2.2 Thread a per-root anchor map (`Map<string, HTMLElement>`) through `renderNodeElement`/`patchNode`/`patchChildren`, populated when a view calls `registerAnchor` during its own render
- [x] 2.3 Implement the `mountChild` port operation: look up the anchor element for `(parentRoot, anchor)`, throw a clear error if none was registered, and create a new per-root container under it reusing the existing root-creation logic (container, identity attribute, native interaction listener) parameterized by container instead of `host`
- [x] 2.4 Add the `.closest(PROJECTION_IDENTITY_ATTRIBUTE)` containment guard to `registerInteraction`'s listener: no-op if the event's nearest identity-bearing ancestor is not this container

## 3. React adapter

- [x] 3.1 Add `RegisterAnchorContext = createContext<RegisterAnchor | undefined>(undefined)`, exported. Do **not** mix `registerAnchor` into `ReactView`'s props: a `JsonObject & {registerAnchor}` props type breaks assignability of an existing `FunctionComponent<JsonObject>`-typed view (verified with `tsc` -- caught during implementation, see design.md); `ReactView` stays exactly `FunctionComponent<JsonObject>`
- [x] 3.2 Wrap the rendered tree in a small internal `VelkrenTree` component that provides `RegisterAnchorContext` once (value bound to the current root's anchor map) and renders `renderNode(node, views)` beneath it; the view reads it via `useContext(RegisterAnchorContext)` and calls it from a `ref` callback on the element it wants to expose (a real DOM node only exists at commit, not in the render body)
- [x] 3.3 Implement the `mountChild` port operation: look up the anchor element, throw if none was registered, and create a new, independent React root (`createReactRoot`) under it — not a portal — reusing the same `flushSync`/`stampIdentity`/native-listener setup as a top-level root
- [x] 3.4 Add the `.closest(PROJECTION_IDENTITY_ATTRIBUTE)` containment guard to the container's native interaction listener
- [x] 3.5 Verify with `tsc` that an existing `FunctionComponent<JsonObject>`-typed view is still assignable to `ReactView` after this change (no compile error)

## 4. Vue adapter

- [x] 4.1 Add `REGISTER_ANCHOR_KEY: InjectionKey<RegisterAnchor> = Symbol(...)`, exported. Do **not** mix `registerAnchor` into `VueView`'s props, for the same reason as React (`VueView` stays exactly `FunctionalComponent<JsonObject>`)
- [x] 4.2 Add a small internal `VelkrenTree` component (`defineComponent` with a `setup()`) that `provide(REGISTER_ANCHOR_KEY, ...)`s once (value bound to the current root's anchor map) and renders `buildVNode(node, views)` beneath it; the view reads it via `inject(REGISTER_ANCHOR_KEY)` and calls it from a `ref` on the element it wants to expose
- [x] 4.3 Implement the `mountChild` port operation: look up the anchor element, throw if none was registered, and create a new, independent Vue render root under it — not a `Teleport` — reusing the same `render()`/identity/native-listener setup as a top-level root
- [x] 4.4 Add the `.closest(PROJECTION_IDENTITY_ATTRIBUTE)` containment guard to the container's native interaction listener

## 5. Tests

- [x] 5.1 Core-level test (fake renderer, `packages/core/test/`) covering `ProjectionRuntime.mountChild`: mounts a child projection anchored to a parent root, asserts the fake renderer tracks it correctly; releasing the parent cascades to release the child; releasing the child independently leaves the parent active and does not double-release on the parent's later release; a foreign-runtime parent or instance is rejected before any port call
- [x] 5.2 Solid adapter test: a registered view registers an anchor, a child component instance's projection mounts into it via `mountChild`, the child's content appears inside the anchor element in the real DOM, the child's own interaction is isolated from the parent view's node (including: an interaction inside the child does NOT also fire the parent's own registered interaction, proving the containment guard), and disposing the parent's root disposes the child
- [x] 5.3 Same test shape in the React adapter, confirming no console warning fires (existing suite trap) and the child is mounted as an independent React root, not a portal
- [x] 5.4 Same test shape in the Vue adapter
- [x] 5.5 A test (any one adapter) proving an unmodified, anchor-less registered view still renders as a strict leaf exactly as before (the existing "renders a registered view as a leaf" tests must still pass unchanged)
- [x] 5.6 A test proving `mountChild` throws a clear error when the named anchor was never registered
- [x] 5.7 (Added during a second adversarial review pass) A Vue test proving
      plain, non-nested interaction delivery still works (Vue previously had
      no such regression test at all, unlike Solid/React)
- [x] 5.8 (Added during a second adversarial review pass) A Solid test
      proving a stale anchor (the view stopped rendering it on a later
      commit) is treated as unregistered rather than silently mounting into
      a detached element -- see design.md's added Risk entry and the
      `.contains()` fix in all three adapters' `mountChild`

## 6. Verification

- [x] 6.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` and confirm all four pass
- [x] 6.2 Confirm the existing leaf-only view-registry tests (all three adapters) still pass unchanged, proving the default (anchor-less) behavior is unaffected
