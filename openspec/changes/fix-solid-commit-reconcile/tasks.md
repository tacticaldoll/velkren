## 1. Baseline and test scaffolding

- [ ] 1.1 Add a SolidJS adapter test asserting element-identity preservation across a same-shape commit: mount a `div > input`, capture the input DOM node, commit again with only the input's `value` attribute changed, and assert the input is the same DOM node with the new attribute applied.
- [ ] 1.2 Add a test for in-place attribute and structural change: commit changes to a primitive element's attributes plus one added and one removed child, asserting unchanged sibling elements keep their DOM identity and only affected children are added/removed.
- [ ] 1.3 Add a test that a committed node dropping an attribute removes that attribute from the existing element (attribute clearing, not just setting).
- [ ] 1.4 Confirm tests 1.1–1.3 fail against the current rebuild implementation (red baseline).

## 2. Reconcile-in-place implementation

- [ ] 2.1 Replace the whole-tree `createSignal<RenderNode>` + `createRenderEffect` + `replaceChildren` with a direct patch: hold the last committed `RenderNode` and the mounted content element on the adapter root; build the initial content with the existing `renderNodeElement` (renamed/kept as `buildNode`).
- [ ] 2.2 Implement `patchNode(el, oldNode, newNode, views)`: rebuild via `buildNode` when the kind differs or either kind is a registered view; otherwise patch attributes and children in place and return the same element.
- [ ] 2.3 Implement `patchAttributes` (set only changed attributes by comparing stringified values; remove attributes absent from the new node) and `patchChildren` (index-based: patch the common prefix, append built elements for new tail nodes, remove trailing elements for dropped nodes; swap an element in its parent when `patchNode` returns a new one).
- [ ] 2.4 Drive the patch from `commit`: re-enter the root's reactive owner with `runWithOwner(getOwner()-captured owner, ...)` so a `buildNode` on commit keeps view effects owned; update the held node and swap the root content element if its kind changed.

## 3. Preserve existing contracts

- [ ] 3.1 Re-stamp the identity attribute on the per-root container on every commit as its own step (commit-repair), independent of whether any content node changed.
- [ ] 3.2 Keep the view-registry path in `buildNode` per node: on a `views[kind]` hit render the registered Solid view as a self-contained leaf with the node's attributes as props, children not projected into it; on a miss build the primitive element. Views may re-instantiate on commit.
- [ ] 3.3 Keep interaction capture as the native per-root-container listener, unchanged; keep `simulateInteraction` dispatching from the container's content element.
- [ ] 3.4 Keep disposal via `createRoot`'s `dispose`; confirm the captured owner, owned view effects, and DOM dispose together (extend the disposal test to assert no effects run after unmount).

## 4. Verification

- [ ] 4.1 Confirm tests 1.1–1.3 now pass (green) and the existing SolidJS adapter suite passes unchanged.
- [ ] 4.2 Run the two-editor validation and membrane suites; confirm they pass with no `@velkren/core`, `@velkren/element`, or React/Vue adapter changes.
- [ ] 4.3 Run the Definition of Done from the project root: `npm run build`, `npm test`, `npm run lint`, `npm run format:check`.
