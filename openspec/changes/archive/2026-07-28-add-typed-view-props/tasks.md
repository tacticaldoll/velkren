## 1. Core: discriminated node types

- [x] 1.1 In `packages/core/src/template-class.ts`, split `TemplateNode` into `TemplatePrimitiveNode` (existing shape: `kind`, optional `attributes`, `children`, `slots`) and `TemplateViewNode` (`{ node: "view", viewId, props? }`), unioned as `TemplateNode`.
- [x] 1.2 Split `RenderNode` the same way into `RenderPrimitiveNode` (existing shape, all fields present after freezing) and `RenderViewNode` (`{ node: "view", viewId, props }`), unioned as `RenderNode`.
- [x] 1.3 Add and export a shared `isViewNode` type guard usable against both `TemplateNode` and `RenderNode`.
- [x] 1.4 Update `freezeNode` to branch on the discriminant: for a view node, validate `viewId` is a non-blank string (mirroring the existing `kind` non-blank check) and freeze `{ node: "view", viewId, ...(props !== undefined ? { props } : {}) }`, without touching `children`/`slots`. For a primitive node, behavior is unchanged.
- [x] 1.5 Update any `TemplateDefinitionError` messages that reference `node.kind` to handle the view-node case (report `viewId` instead where relevant).

## 2. Core: plan resolution and fake renderer

- [x] 2.1 In `packages/core/src/template-runtime.ts` `#buildNode`, branch on the discriminant: for a view node, validate `props` via the existing `createJsonSnapshot` call (mirroring the `attributes` validation) and return a frozen `{ node: "view", viewId, props }` with no recursion into children/slots; for a primitive node, behavior is unchanged.
- [x] 2.2 Update the `RenderPlanError` message for non-JSON values to reference `viewId`/`props` in the view-node branch.
- [x] 2.3 In `packages/core/src/fake-renderer.ts`, update `build()` to branch on the discriminant: a view node projects to `FakeRenderedNode` as `{ kind: viewId, attributes: {...props, [identity attr]?}, children: [] }`, but add a distinguishing marker (e.g. `readonly isView?: true` on `FakeRenderedNode`, present only for a view-node origin) so a core-level test can tell a real view node apart from a childless primitive whose `kind` coincidentally equals that `viewId` — the two would otherwise be structurally identical in the fake renderer's output.
- [x] 2.4 Export the new types (`TemplatePrimitiveNode`, `TemplateViewNode`, `RenderPrimitiveNode`, `RenderViewNode`, `isViewNode`) from `packages/core/src/index.ts` alongside the existing `TemplateNode`/`RenderNode` exports.
- [x] 2.5 Verify `packages/core/src/renderer-port.ts` (`commit(root, node: RenderNode)`) and `packages/core/src/state-binding.ts` (`StateDerivation<T> = (value: T) => RenderNode`) type-check unchanged against the new union — no structural change expected in either file, this is a `tsc` confirmation, not an edit.

## 3. Adapters: registry keyed by viewId

- [x] 3.1 `packages/solid-adapter/src/index.ts`: change the view-registry consultation (`views[node.kind]`, including the reconcile-time `oldIsView`/`newIsView` checks) to consult `views[node.viewId]` only when `isViewNode(node)` is true; pass `node.props` as props; throw a clear error (`no view registered for viewId "…"`) when a view node's `viewId` is unregistered. `patchNode`'s rebuild-vs-patch decision must also treat a variant change at the same tree position (primitive→view or view→primitive across a commit) as a rebuild, not just a `kind`/`viewId` change within the same variant — add a test for this transition case (§4.2).
- [x] 3.2 `packages/react-adapter/src/index.ts`: change `renderNode`'s `views[node.kind]` lookup to consult `views[node.viewId]` only when `isViewNode(node)` is true; pass `node.props` as props instead of `node.attributes`; throw the same explicit error on an unregistered `viewId`; the primitive path (attribute translation, controlled-value handling, children) is otherwise unchanged and untouched by the view branch.
- [x] 3.3 `packages/vue-adapter/src/index.ts`: change the `views[node.kind]` lookup to consult `views[node.viewId]` only when `isViewNode(node)` is true; pass `node.props` as props; throw the same explicit error on an unregistered `viewId`.
- [x] 3.4 Confirm each adapter's `*ViewRegistry` type alias (keyed by string) needs no structural change — only the key semantics (`viewId` instead of `kind`) and the lookup guard change.

## 4. Update existing tests and fixtures

- [x] 4.1 `packages/core/test/*`: update any inline `RenderNode`/`TemplateNode` test fixtures that exercise the view-node shape (if any) to the new discriminated shape; add core-level unit coverage for `freezeNode`/`#buildNode`/`isViewNode` view-node validation (non-blank `viewId`, strict-JSON `props`, no `children`/`slots` on a view node, rejection of non-JSON `props`).
- [x] 4.2 `packages/solid-adapter/test/solid-adapter.test.ts`, `packages/react-adapter/test/react-adapter.test.ts`, `packages/vue-adapter/test/vue-adapter.test.ts`: rewrite every test node authored as a registered view (previously `node(kind, attributes, ...)` matching a registry key) to the new `{ node: "view", viewId, props }` shape; add a regression test per adapter for "an unregistered `viewId` throws a clear error"; add a regression test per adapter for "a primitive node whose `kind` coincidentally matches a registry key still renders as a primitive"; add a regression test per adapter for "a commit that changes a node's variant (primitive↔view) at the same tree position rebuilds rather than patches."
  - [x] 4.2.1 Each adapter's existing test asserting a registered-view node's non-empty `children` are dropped (Solid `solid-adapter.test.ts` ~L520-535, React `react-adapter.test.ts` ~L464-481) tests a fixture shape that can no longer be authored (a view node has no `children` field). Retire these tests; their guarantee is now enforced by the type system plus the core-level "a view node carries no children or slots" test added in §4.1, so no adapter-level replacement is needed.
- [x] 4.3 Confirm `packages/neutral-composition-fixture` needs no change (it does not use registered views) by running its suite unchanged.

## 5. Verification and documentation

- [x] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` at the workspace root; fix any fallout.
- [x] 5.2 Run `openspec validate --strict` and `openspec validate --specs` and resolve any issues.
- [x] 5.3 Commission an independent adversarial review against `PROJECT.md` invariants (renderer neutrality, immutable snapshot boundaries) and this change's own specs before committing apply output.
