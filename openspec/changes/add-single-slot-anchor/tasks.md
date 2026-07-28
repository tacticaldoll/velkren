## 1. Solid adapter

- [ ] 1.1 Add a per-root `slotAnchorNames: WeakMap<HTMLElement, string>` alongside `anchors`.
- [ ] 1.2 Add a `registerSlotAnchor(node, element, anchors, slotAnchorNames)` helper: compute the sole
      key of `node.slots` (undefined unless there's exactly one entry); if `slotAnchorNames` holds a
      different previous name for `element`, delete that old `anchors` entry (only if it still points
      at this same `element`); then either set the new `anchors`/`slotAnchorNames` entry, or clear
      `slotAnchorNames` for `element` if there's no sole name.
- [ ] 1.3 Call `registerSlotAnchor` in `renderNodeElement`'s primitive build path.
- [ ] 1.4 Call `registerSlotAnchor` in `patchNode`'s same-`kind` patch-in-place branch.
- [ ] 1.5 Add tests: sole-slot node becomes a valid `mountChild` target; zero/multi-slot node registers
      nothing; a node that gains its sole slot on a patch-in-place commit (no rebuild) becomes mountable
      after that commit; a node whose sole slot is renamed on a patch-in-place commit makes the old name
      un-mountable and the new name mountable; a node whose sole slot is removed on a patch-in-place
      commit makes the old name un-mountable.

## 2. React adapter

- [ ] 2.1 Add `anchors: Map<string, HTMLElement>` as a parameter to `renderNode`, threaded through its
      recursive children-mapping call and through the `VelkrenTree` call site.
- [ ] 2.2 Add a per-root `slotAnchorNames: WeakMap<HTMLElement, string>` alongside `anchors`.
- [ ] 2.3 In the primitive branch, compute the sole resolved slot name (if `Object.keys(node.slots).length
      === 1`) and attach a `ref` callback whenever either it or `controlledValue` is defined: on
      `element === null`, run the same compare-and-clean logic as Solid's `registerSlotAnchor` using
      this closure's own node; on a real element, apply the controlled value (if any) and register the
      slot anchor (if any) — never letting one concern silently drop the other.
- [ ] 2.4 Add tests: sole-slot node becomes a valid `mountChild` target; a controlled `input` with a
      sole resolved slot keeps both the controlled-value assignment and the anchor registration;
      zero/multi-slot node registers nothing; a node whose sole slot is renamed or removed on a
      re-render (same element, no key change) makes the old name un-mountable.

## 3. Vue adapter

- [ ] 3.1 Add `anchors: Map<string, HTMLElement>` as a parameter to `buildVNode`, threaded through its
      recursive children-mapping call; change `VelkrenTree`'s render to call
      `buildVNode(props.node, props.views, props.anchors)`.
- [ ] 3.2 Add a per-root `slotAnchorNames: WeakMap<HTMLElement, string>` alongside `anchors`.
- [ ] 3.3 In the primitive branch, add a `ref` prop (when the sole resolved slot name is defined) that
      runs the same compare-and-clean logic on both the null-unmount call and the element-attach call.
- [ ] 3.4 Add tests: sole-slot node becomes a valid `mountChild` target; zero/multi-slot node registers
      nothing; a node whose sole slot is renamed or removed on a re-render (same element, no key
      change) makes the old name un-mountable. If Vue does not re-invoke the `ref` for an unchanged
      element on a slot-name-only change, move the compare-and-clean call into `buildVNode` itself
      (which always runs) instead of relying on `ref` re-invocation, per design.md.

## 4. Verification

- [ ] 4.1 Run the full test suite across all three adapter packages and confirm no regression.
- [ ] 4.2 Adversarial review of the implementation (fresh agent, no prior context).
- [ ] 4.3 Sync delta specs into `openspec/specs/{solid-adapter-prototype,react-adapter,vue-adapter}/spec.md`.
- [ ] 4.4 Update `BACKLOG.md` with this change's entry and outcome.
- [ ] 4.5 Archive the change.
- [ ] 4.6 Open a PR, verify CI is green, and squash-merge to `main`.
