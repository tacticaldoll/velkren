## 1. Baseline and test scaffolding

- [x] 1.1 Add a SolidJS adapter test asserting element-identity preservation across a same-shape commit: mount a `div > input`, capture the input DOM node, commit again with only the input's `value` attribute changed, and assert the input is the same DOM node with the new attribute applied.
- [x] 1.2 Add a test for in-place attribute and structural change: commit changes to a primitive element's attributes plus one added and one removed child, asserting unchanged sibling elements keep their DOM identity and only affected children are added/removed.
- [x] 1.3 Add a test that a committed node dropping an attribute removes that attribute from the existing element (attribute clearing, not just setting).
- [x] 1.4 Confirm the rebuild baseline is red: the empirical probe this cycle showed the current SolidJS adapter destroys and recreates the DOM node on commit (`sameNode = false`), the exact behavior tests 1.1–1.3 forbid.

## 2. Reconcile-in-place implementation

- [x] 2.1 Keep the whole-tree `createSignal<RenderNode>` + `createRenderEffect`, but change the effect body from `replaceChildren(renderNodeElement(...))` to an in-place reconcile; carry the previously rendered `RenderNode` and the mounted content element across effect runs.
- [x] 2.2 Implement `patchNode(el, oldNode, newNode, views)`: rebuild via `renderNodeElement` when the kind differs or either kind is a registered view; otherwise patch attributes and children in place and return the same element.
- [x] 2.3 Implement `patchAttributes` (set only attributes whose stringified value changed; remove attributes absent from the new node) and `patchChildren` (index-based: patch the common prefix, append built elements for new tail nodes, remove trailing elements for dropped nodes; swap an element in its parent when `patchNode` returns a new one).
- [x] 2.4 Drive the reconcile from the render effect (the commit signal re-runs it): on first run build and mount the content; on later runs patch in place and swap the root content element if its kind changed. Keeping the patch inside the effect preserves SolidJS's automatic disposal of the prior run's view cleanups — no `getOwner`/`runWithOwner` needed.

## 3. Preserve existing contracts

- [x] 3.1 Re-stamp the identity attribute on the per-root container at the top of every effect run (commit-repair), independent of whether any content node changed; the effect runs synchronously so `projection.commit`'s immediate `readIdentity` check passes.
- [x] 3.2 Keep the view-registry path in `renderNodeElement` per node: on a `views[kind]` hit render the registered Solid view as a self-contained leaf with the node's attributes as props, children not projected into it; on a miss build the primitive element. Views re-instantiate on commit.
- [x] 3.3 Keep interaction capture as the native per-root-container listener, unchanged; keep `simulateInteraction` dispatching from the container's content element.
- [x] 3.4 Keep disposal via `createRoot`'s `dispose`; the render effect, its owned view cleanups, and the DOM dispose together (existing disposal and view-scope tests assert no effect runs after unmount).

## 4. Verification

- [x] 4.1 Tests 1.1–1.3 pass (green) and the existing SolidJS adapter suite passes unchanged (39 tests in the Solid + two-editor run).
- [x] 4.2 The two-editor validation and membrane suites pass with no `@velkren/core`, `@velkren/element`, or React/Vue adapter changes.
- [x] 4.3 Definition of Done from the project root passes: `npm run build`, `npm test` (368 tests), `npm run lint`, `npm run format:check`.
