## 1. Core: key field and template-time validation

- [ ] 1.1 In `packages/core/src/template-class.ts`, add optional `key?: string` to `TemplatePrimitiveNode` and `TemplateViewNode`, and `key?: string` to `RenderPrimitiveNode`/`RenderViewNode` (present only when provided, mirroring how `attributes`/`props` are conditionally included).
- [ ] 1.2 In `freezeNode`, validate `key` non-blank when present (mirroring the existing `kind`/`viewId` non-blank checks), and after building a primitive node's `children` array, validate sibling key consistency: either every child has a `key` or none do, and no two children share a `key`; throw `TemplateDefinitionError` otherwise.
- [ ] 1.3 Carry `key` through unchanged in the primitive-node and view-node branches' frozen return objects.

## 2. Core: plan resolution

- [ ] 2.1 In `packages/core/src/template-runtime.ts` `#buildNode`, carry a node's `key` through unchanged into the resulting `RenderNode` (both the primitive and view branches), with no re-validation (already validated at template-authoring time).
- [ ] 2.2 Export nothing new from `packages/core/src/index.ts` — `key` is a field on already-exported types, not a new export.
- [ ] 2.3 Verify `packages/core/src/renderer-port.ts` and `packages/core/src/state-binding.ts` type-check unchanged against the widened node types — a `tsc` confirmation, not an edit.

## 3. Adapters: keyed child reconciliation

- [ ] 3.1 `packages/react-adapter/src/index.ts`: change `renderNode`'s children-mapping call from `renderNode(child, views, String(index))` to `renderNode(child, views, child.key ?? String(index))`. No other change — React's own reconciler does the rest.
- [ ] 3.2 `packages/vue-adapter/src/index.ts`: change `buildVNode`'s children-mapping call from `buildVNode(child, views, String(index))` to `buildVNode(child, views, child.key ?? String(index))`. No other change — Vue's own reconciler does the rest.
- [ ] 3.3 `packages/solid-adapter/src/index.ts`: add an `isKeyedList(children)` helper (`children.length > 0 && children.every(c => c.key !== undefined)`). In `patchChildren`, when either `oldChildren` or `newChildren` is a keyed list, delegate to a new `patchKeyedChildren(parent, oldChildren, newChildren, views, anchors)`; otherwise keep the existing positional body unchanged.
- [ ] 3.4 Implement `patchKeyedChildren` in `packages/solid-adapter/src/index.ts`: index old children by key (reading `parent.children[i]` for each keyed old child); for each new child, reuse+`patchNode` a key match (removing the old element first if `patchNode` rebuilt rather than patched it) or build fresh via `renderNodeElement` on no match; remove any old keyed element whose key wasn't reused; reorder the resulting elements into place with a single `insertBefore` pass walking `parent.firstChild`/`nextSibling`.

## 4. Tests

- [ ] 4.1 `packages/core/test/template-class.test.ts`: add tests for a valid keyed sibling list, a rejected blank key, rejected mixed keyed/unkeyed siblings, and rejected duplicate sibling keys.
- [ ] 4.2 `packages/core/test/template-runtime.test.ts`: add a test that a node's `key` carries through `resolvePlan` unchanged, for both a primitive and a view node.
- [ ] 4.3 `packages/solid-adapter/test/solid-adapter.test.ts`: add tests (calling `renderer.commit` directly, mirroring how a `state-binding` derivation would drive it — no template/state-binding domain plumbing needed) for: a keyed list reordering preserves each key's DOM element (assert by giving each element a distinguishing marker, e.g. a live property or focus, before the reorder); a keyed list insert/remove only rebuilds the changed keys; an unkeyed list is unaffected (existing tests already cover this — confirm, don't duplicate); a keyed list nested as a non-root child (through `patchChildren`'s recursive call) reorders correctly.
- [ ] 4.4 `packages/react-adapter/test/react-adapter.test.ts`: add a test that a keyed list reorder preserves each key's DOM element identity (e.g. assert `document.activeElement`/a live property survives a reorder that moves the focused row), and that an unkeyed list still reconciles positionally (existing coverage — confirm).
- [ ] 4.5 `packages/vue-adapter/test/vue-adapter.test.ts`: same pair of tests as React, adapted to Vue's renderer.

## 5. Verification and documentation

- [ ] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` at the workspace root; fix any fallout.
- [ ] 5.2 Run `openspec validate --strict` and `openspec validate --specs`; resolve any issues.
- [ ] 5.3 Commission an independent adversarial review against `PROJECT.md` invariants and this change's own specs before committing apply output, specifically scrutinizing the SolidJS `patchKeyedChildren` algorithm for correctness on every insert/remove/reorder/kind-change-within-a-key combination.
