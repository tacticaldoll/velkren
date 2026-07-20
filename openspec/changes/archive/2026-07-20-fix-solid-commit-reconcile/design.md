## Context

The SolidJS adapter (`packages/solid-adapter/src/index.ts`) mounts a root by holding the whole render node in one signal and running a render effect that fully rebuilds the container's content on every change:

```ts
const [current, setNode] = createSignal<RenderNode>(node);
createRenderEffect(() => {
  rootContainer.setAttribute(PROJECTION_IDENTITY_ATTRIBUTE, identity); // commit-repair
  rootContainer.replaceChildren(renderNodeElement(current(), views)); // full rebuild
});
// commit(root, id, node) => adapterRoot.setNode(() => node)
```

`renderNodeElement` builds primitive elements with `document.createElement` and recurses into children with `element.replaceChildren(...)`. Every commit therefore discards and recreates every DOM node.

An empirical probe this cycle (happy-dom; all three adapters; a fixed-shape `div > input`; the input's `value` attribute changed across one commit; the input DOM node marked before commit) confirmed:

| Adapter | same DOM node after commit | marker survived |
| ------- | -------------------------- | --------------- |
| React   | yes                        | yes             |
| Vue     | yes                        | yes             |
| SolidJS | **no**                     | **no**          |

React and Vue reconcile through their frameworks and already preserve node identity for a fixed-shape tree. SolidJS is the sole outlier. The upcoming reactive state loop will re-commit an unchanged-shape tree whenever bound state changes; with a full rebuild that would destroy the element the user is editing, losing focus, caret, and selection.

Constitutional constraints from `PROJECT.md` that bound this design: renderer-specific and reactive types stay inside the adapter; `@velkren/core` and the `RendererPort` contract must not change; the adapter must remain buildable by plain `tsc -b` (the adapter currently uses **no JSX**, no babel, no `vite-plugin-solid`).

## Goals / Non-Goals

**Goals:**

- A commit reconciles the existing DOM tree in place: an unchanged primitive element keeps its existing DOM node across a commit; only changed attributes and structure are applied.
- Preserve every existing adapter contract: commit-repair of the identity attribute on the per-root container, container-level interaction capture, view-registry leaf rendering, and deterministic disposal.
- Behavior-preserving at the port boundary — no `@velkren/core` or `RendererPort` change; React/Vue adapters untouched.
- Keep the adapter JSX-free and dependency-neutral.

**Non-Goals:**

- Stable-key reconcile for dynamic / reordering child collections. This change stays index-keyed (matching today's positional semantics). Keyed reconcile is a separate future change (`add-keyed-node-reconcile`) driven by an actual list-binding use case.
- The reactive loop itself (mutable state, state→view binding). Deferred to `add-managed-state` and `add-state-binding`.
- Reactive attribute propagation into a registered view. A registered view remains a self-contained leaf; the controlled-input concern is a `add-state-binding` matter, not this change.

## Decisions

### D1: A direct, recursive, index-keyed DOM patch on commit (no Solid store, no JSX)

Keep the existing whole-tree signal + `createRenderEffect`, but change the effect body from "rebuild via `replaceChildren`" to "reconcile in place". The effect carries the previously rendered `RenderNode` and the mounted content element across runs; on each run (the first mount, and every commit that sets the signal) it walks old-vs-new and mutates the existing DOM:

```
patchNode(el, oldNode, newNode):
  if oldNode.kind !== newNode.kind, or either kind is a registered view:
      return buildNode(newNode)                 // caller swaps the element in its parent
  patchAttributes(el, oldNode.attributes, newNode.attributes)   // set changed, remove dropped
  patchChildren(el, oldNode.children, newNode.children)         // by index: patch common, append/remove tail
  return el
```

`buildNode` is the existing `renderNodeElement` (registry-aware: a `views[kind]` hit renders the registered Solid view leaf with raw attributes as props; a miss builds a primitive element with attributes and children). `patchAttributes` sets only attributes whose stringified value changed and removes attributes absent from the new node. `patchChildren` reconciles by position: patch the common prefix in place, append built elements for new tail nodes, remove trailing elements for dropped nodes.

**Why this over the Solid-store alternative originally sketched:**

- Solid's `createStore` + `reconcile` reconciles **data**, not DOM. Without JSX, turning reconciled store data into fine-grained DOM updates still requires either `solid-js/web`'s imperative `insert`/`assign` runtime or a hand-written DOM-sync layer — so the store buys little for an adapter whose entire job is DOM.
- A `RenderNode` from `template-runtime` is **deeply frozen** (`attributes`, `children`, and the node are `Object.freeze`d). `createStore`/`reconcile` write into their argument's shape and throw `Cannot assign to read only property` on a frozen input — verified empirically this cycle. The store path would need a per-commit deep clone just to avoid the crash. The direct patch only ever _reads_ the frozen node, so freezing is a non-issue.
- The in-place patch adds **no new import** (it keeps `createSignal`/`createRenderEffect`); the store path added `solid-js/store`. Less surface, more inspectable, and it is the honest shape of the work.

Rejected as before: JSX `<Index>`/`<For>` (would force a JSX toolchain into a package that builds with plain `tsc -b`).

Keeping the patch inside the render effect (rather than driving it imperatively from `commit`) is deliberate: when the signal changes, the effect re-runs, and SolidJS disposes the prior run's owned cleanups first. A registered view leaf registers `onCleanup` during its build, so it is disposed and re-instantiated on each commit exactly as before — the behavior the existing view-disposal test pins. An imperative-from-`commit` patch would lose that automatic sub-scope disposal.

### D2: Index-keyed, so behavior-preserving; keyed reconcile is the deferred upgrade

`patchChildren` matches children by position, reproducing today's implicit positional semantics exactly for fixed-shape trees. It is correct while child lists do not reorder. Stable-key reconcile (matching children by an explicit key so a reordering list preserves each element) is the whole of the deferred `add-keyed-node-reconcile`; the upgrade is localized to `patchChildren`'s matching step.

### D3: Views re-instantiate on commit; only primitives are preserved

A registered view leaf receives the node's `attributes` as plain props (not a signal), so it cannot reflect a changed attribute without being re-run. `patchNode` therefore rebuilds a node whose kind is a registered view on every commit — exactly today's behavior. The element-preservation guarantee is scoped to **primitive** elements (the `document.createElement` path), which is what the reactive loop needs (a text field is a primitive). This keeps the change strictly behavior-preserving for views while adding preservation for primitives.

### D4: Preserve owner, commit-repair, interaction capture, and disposal

- **Owner**: `renderNodeElement` (including any view instantiation) runs inside the render effect, so a view's `onCleanup` is owned by that effect and disposed when it re-runs or the root disposes — unchanged from today, and no `getOwner`/`runWithOwner` is needed.
- **Commit-repair**: re-stamp the identity attribute on the per-root container at the top of every effect run, independent of whether any content node changed. The effect runs synchronously when the commit signal is set, so `projection.commit`'s immediate `readIdentity` check sees the repaired attribute.
- **Interaction capture**: unchanged — a native listener on the per-root container, read at event time.
- **Disposal**: unchanged — `createRoot`'s `dispose`; the effect, its owned view cleanups, and the DOM live under it and dispose together.

## Risks / Trade-offs

- **Hand-written patch could diverge from the old build output (an attribute applied differently, a child mis-indexed), silently corrupting the DOM.** → `patchAttributes`/`buildNode` share `stringifyAttribute`; tests assert element identity preservation, in-place attribute set, attribute removal on drop, and child add/remove, plus the unchanged two-editor and membrane suites.
- **A view's effects could leak if `buildNode` runs outside the owner on commit.** → `commit` wraps the patch in `runWithOwner(owner, ...)`; the disposal test asserts no effects run after unmount.
- **Caret movement on a focused input.** `patchAttributes` writes an attribute only when its stringified value changed, avoiding redundant writes. Setting the `value` _attribute_ (not the `.value` property) does not move the caret of a user-edited field; the property-vs-attribute controlled-input concern is explicitly deferred to `add-state-binding`.
- **`patchChildren` assumes all DOM children are elements (no text nodes).** True today: the adapter renders only element nodes from `children` and ignores `slots`/content. → Kept as an invariant; if content/text rendering is added later it must extend `patchChildren`.

## Migration Plan

Internal-only refactor of one adapter file; no consumer-facing API change and no data. Rollback is reverting the single file. Verification is the Definition of Done plus the new identity-preservation, attribute-drop, and child add/remove tests, and the unchanged two-editor and membrane suites.

## Open Questions

- None blocking.
