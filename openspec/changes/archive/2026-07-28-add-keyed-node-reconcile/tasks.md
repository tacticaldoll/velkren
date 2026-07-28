## 1. Core: key field and template-time validation

- [x] 1.1 In `packages/core/src/template-class.ts`, add optional `key?: string` to `TemplatePrimitiveNode` and `TemplateViewNode`, and `key?: string` to `RenderPrimitiveNode`/`RenderViewNode` (present only when provided, mirroring how `attributes`/`props` are conditionally included).
- [x] 1.2 In `freezeNode`, validate `key` non-blank when present (mirroring the existing `kind`/`viewId` non-blank checks), and after building a primitive node's `children` array, validate sibling key consistency: either every child has a `key` or none do, and no two children share a `key`; throw `TemplateDefinitionError` otherwise.
- [x] 1.3 Carry `key` through unchanged in the primitive-node and view-node branches' frozen return objects.

## 2. Core: plan resolution

- [x] 2.1 In `packages/core/src/template-runtime.ts` `#buildNode`, carry a node's `key` through unchanged into the resulting `RenderNode` (both the primitive and view branches), with no re-validation (already validated at template-authoring time).
- [x] 2.2 Export nothing new from `packages/core/src/index.ts` — `key` is a field on already-exported types, not a new export.
- [x] 2.3 Verify `packages/core/src/renderer-port.ts` and `packages/core/src/state-binding.ts` type-check unchanged against the widened node types — a `tsc` confirmation, not an edit.

## 3. Adapters: keyed child reconciliation

- [x] 3.1 `packages/react-adapter/src/index.ts`: change `renderNode`'s children-mapping call from `renderNode(child, views, String(index))` to `renderNode(child, views, child.key ?? String(index))`. No other change — React's own reconciler does the rest.
  - [x] 3.1.1 **Revised after implementation review**: `child.key ?? String(index)` unconditionally could collide an explicit key with a synthesized index key on a partially-keyed list (reachable only via a direct `commit()`, since template authoring rejects that shape). Changed to gate on `isKeyedChildren = node.children.length > 0 && node.children.every(c => c.key !== undefined)`: use every child's real key only when the whole array is fully keyed, otherwise every child uses its positional index — mirroring the SolidJS adapter's gate.
- [x] 3.2 `packages/vue-adapter/src/index.ts`: same fully-keyed-or-fully-positional gate as 3.1.1, applied to `buildVNode`'s children-mapping call.
- [x] 3.3 `packages/solid-adapter/src/index.ts`: add an `isKeyedList(children)` helper (`children.length > 0 && children.every(c => c.key !== undefined)`). In `patchChildren`, when either `oldChildren` or `newChildren` is a keyed list, delegate to a new `patchKeyedChildren(parent, oldChildren, newChildren, views, anchors)`; otherwise keep the existing positional body unchanged.
- [x] 3.4 Implement `patchKeyedChildren` in `packages/solid-adapter/src/index.ts` as follows (order matters — this fixes a transition-case DOM leak an adversarial review caught in the propose stage, see design.md's Decisions/Risks):
  1. Index old children by key into a `Map<string, {node, element}>`, reading `parent.children[i]` for each old child that has a `key` (an unkeyed old child is deliberately left unindexed here).
  2. For each new child, build the resulting element: on a key match, `patchNode` the existing element; on no match (including any new child with no key, or a key with no old match), build fresh via `renderNodeElement`. Add every resulting element to a `reused: Set<HTMLElement>` and to an ordered `nextElements` array, in new-child order.
     - [x] **Revised after implementation review**: a duplicate key within `newChildren` (only reachable via a direct `commit()`) must not match the same old element twice — doing so puts the identical object reference into `nextElements` at two positions, silently dropping a row. Fixed with a `claimed: Set<string>` of keys already matched in this same commit: a new child's key only matches `oldByKey` if not already claimed; a repeat is always treated as unmatched and gets a freshly built element instead.
  3. Snapshot `parent.children` into a plain array _before_ removing anything (a live `HTMLCollection` mutates under removal), then remove every element in that snapshot that is NOT in `reused` — this is deliberately NOT scoped to "only previously-keyed elements": it must also sweep any leftover unkeyed old element (the not-fully-keyed → fully-keyed transition case) and any earlier duplicate-key old element the `Map` overwrote in step 1.
  4. Reorder `nextElements` into place with a single pass: walk `parent.firstChild`/`nextSibling` as `refNode`; for each element in `nextElements`, if `element === refNode` advance `refNode` to its `nextSibling`, otherwise `parent.insertBefore(element, refNode)` (works whether `element` is already elsewhere in `parent` or not yet attached at all).

## 4. Tests

- [x] 4.1 `packages/core/test/template-class.test.ts`: add tests for a valid keyed sibling list, a rejected blank key, rejected mixed keyed/unkeyed siblings, and rejected duplicate sibling keys.
- [x] 4.2 `packages/core/test/template-runtime.test.ts`: add a test that a node's `key` carries through `resolvePlan` unchanged, for both a primitive and a view node.
- [x] 4.3 `packages/solid-adapter/test/solid-adapter.test.ts`: add tests (calling `renderer.commit` directly, mirroring how a `state-binding` derivation would drive it — no template/state-binding domain plumbing needed) for: a keyed list reordering preserves each key's DOM element (assert by giving each element a distinguishing marker, e.g. a live property or focus, before the reorder); a keyed list insert/remove only rebuilds the changed keys; a children array transitioning from unkeyed to fully-keyed across a commit removes every prior unkeyed element and leaks nothing (assert final child count and content match the new keyed list exactly — the specific regression an adversarial review caught in propose); an unkeyed list is unaffected (existing tests already cover this — confirm, don't duplicate); a keyed list nested as a non-root child (through `patchChildren`'s recursive call) reorders correctly.
- [x] 4.4 `packages/react-adapter/test/react-adapter.test.ts`: add a test that a keyed list reorder preserves each key's DOM element identity (e.g. assert `document.activeElement`/a live property survives a reorder that moves the focused row), and that an unkeyed list still reconciles positionally (existing coverage — confirm).
- [x] 4.5 `packages/vue-adapter/test/vue-adapter.test.ts`: same pair of tests as React, adapted to Vue's renderer.

## 5. Verification and documentation

- [x] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` at the workspace root; fix any fallout.
- [x] 5.2 Run `openspec validate --strict` and `openspec validate --specs`; resolve any issues.
- [x] 5.3 Commission an independent adversarial review against `PROJECT.md` invariants and this change's own specs before committing apply output, specifically scrutinizing the SolidJS `patchKeyedChildren` algorithm for correctness on every insert/remove/reorder/kind-change-within-a-key combination.
