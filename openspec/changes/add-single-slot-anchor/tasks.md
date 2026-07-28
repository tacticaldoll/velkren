## 1. Solid adapter

- [x] 1.1 Add a per-root `slotAnchorNames: WeakMap<HTMLElement, string>` alongside `anchors`.
- [x] 1.2 Add a `registerSlotAnchor(node, element, anchors, slotAnchorNames)` helper: compute the sole
      key of `node.slots` (undefined unless there's exactly one entry); if `slotAnchorNames` holds a
      different previous name for `element`, delete that old `anchors` entry (only if it still points
      at this same `element`); then either set the new `anchors`/`slotAnchorNames` entry, or clear
      `slotAnchorNames` for `element` if there's no sole name.
- [x] 1.3 Call `registerSlotAnchor` in `renderNodeElement`'s primitive build path.
- [x] 1.4 Call `registerSlotAnchor` in `patchNode`'s same-`kind` patch-in-place branch.
- [x] 1.5 Add tests: sole-slot node becomes a valid `mountChild` target; zero/multi-slot node registers
      nothing; a node that gains its sole slot on a patch-in-place commit (no rebuild) becomes mountable
      after that commit; a node whose sole slot is renamed on a patch-in-place commit makes the old name
      un-mountable and the new name mountable; a node whose sole slot is removed on a patch-in-place
      commit makes the old name un-mountable.

## 2. React adapter

- [x] 2.1 Add `anchors: Map<string, HTMLElement>` as a parameter to `renderNode`, threaded through its
      recursive children-mapping call and through the `VelkrenTree` call site.
- [x] 2.2 In the primitive branch, compute the sole resolved slot name (if `Object.keys(node.slots).length
    === 1`) and attach a `ref` callback whenever either it or `controlledValue` is defined, using a
      closure-local `attachedElement` variable (not a shared WeakMap) to clean up this closure's own
      slot registration on the `null` call, relying on React's documented callback-ref re-invocation
      (old ref called with `null`, then the new ref, even for an unchanged host element); on a real
      element, applies the controlled value (if any) and registers the slot anchor (if any), never
      letting one concern silently drop the other.
- [x] 2.3 Add tests: sole-slot node becomes a valid `mountChild` target; a controlled `input` with a
      sole resolved slot keeps both the controlled-value assignment and the anchor registration;
      zero/multi-slot node registers nothing; a node whose sole slot is renamed or removed on a
      re-render (same element, no key change) makes the old name un-mountable.

## 3. Vue adapter

- [x] 3.1 Add `anchors: Map<string, HTMLElement>` and a per-root `slotAnchorNames: WeakMap<HTMLElement,
    string>` as parameters to `buildVNode`, threaded through its recursive children-mapping call and
      through `VelkrenTree`'s props/render call.
- [x] 3.2 A `ref`-based approach (mirroring React's) was tried first and falsified by a failing test:
      Vue does not reliably re-invoke a changed `ref` callback for an element reused across a patch, so
      a rename/removal cleanup relying on the `null` call never ran. Replaced with `onVnodeMounted`/
      `onVnodeUpdated` vnode lifecycle hooks (`vnode.el` gives the resolved element), attached
      unconditionally on every primitive node (not only when the current render has a sole slot, so a
      node that just lost its slot still gets cleaned up), calling the same `registerSlotAnchor` helper
      Solid uses.
- [x] 3.3 Add tests: sole-slot node becomes a valid `mountChild` target; zero/multi-slot node registers
      nothing; a node whose sole slot is renamed or removed on a re-render (same element, no key
      change) makes the old name un-mountable.

## 4. Verification

- [ ] 4.1 Run the full test suite across all three adapter packages and confirm no regression.
- [ ] 4.2 Adversarial review of the implementation (fresh agent, no prior context).
- [ ] 4.3 Sync delta specs into `openspec/specs/{solid-adapter-prototype,react-adapter,vue-adapter}/spec.md`.
- [ ] 4.4 Update `BACKLOG.md` with this change's entry and outcome.
- [ ] 4.5 Archive the change.
- [ ] 4.6 Open a PR, verify CI is green, and squash-merge to `main`.
