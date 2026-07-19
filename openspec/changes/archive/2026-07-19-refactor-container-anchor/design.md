## Context

- React owns a per-root container `div` (`rootContainer`, react-adapter/src/index.ts:72)
  but stamps identity on `container.firstElementChild` (:236,:111) and wires
  `onClick`/`onInput` synthetic props on the rendered root element (`renderNode` when
  `isRoot`, :208). `snapshotReactEvent` snapshots a `SyntheticEvent`.
- Solid appends the `document.createElement(node.kind)` root element directly to a
  shared host (`SolidRenderer.container`, the public option, :18); it stamps identity on
  that root element (:162), reads it there (:86), and `addEventListener`s to it (:114).
  There is **no per-root container**.

`registerInteraction` is only ever called on a projection root. Anchoring on the
rendered root element is what would break if that element became a native view. This
refactor moves the anchor to a per-root container; it adds no feature.

## Goals / Non-Goals

**Goals:**

- Identity and interaction anchored on the adapter-owned per-root container in both
  adapters, preserving every observable guarantee.
- `RendererPort` contract and `@velkren/core` unchanged.

**Non-Goals:**

- No view registry (that is the dependent change).
- No `@velkren/core` change; no new behavior.

## Decisions

### D1: Per-root container is the anchor; the shared host keeps the `container` name

The per-root anchor is the container the adapter mounts each root into. To avoid the
naming collision with the existing shared-host option (`SolidRenderer.container` /
`createReactRenderer(container?)` = "the element under which roots mount"), the shared
host keeps the name **`container`** (the option), and the per-root anchor is the
**`rootContainer`** (React already uses this name; Solid adds one). Identity is stamped,
repaired, and read on the `rootContainer`; `elementForIdentity` returns it.

**Why the container**: it is adapter-owned and never reconciled by a view, so identity
on it is strictly more stable than on the rendered element, and it survives the root
node becoming a native view (the reason the dependent change needs this).

### D2: React interaction becomes a native container listener (BREAKING within React)

React's current model wires synthetic `onClick`/`onInput` props on the rendered root
element. A synthetic prop can only sit on a React element, not on the `rootContainer`
(React's mount host), and would not survive the root becoming a native component. So the
adapter attaches a **native** `addEventListener` to the `rootContainer` per registered
interaction type; a real DOM event bubbles through the actual DOM to it regardless of
React's synthetic system. `renderNode` drops `INTERACTION_HANDLER_PROPS` and the
`isRoot` handler wiring; `snapshotReactEvent` is replaced by a native-event snapshot
(mirroring Solid's `snapshotNativeEvent`); `removeRoot` removes the listeners.

**Why**: this is the only way to anchor interaction on the adapter-owned container, and
it converges React's capture with Solid's (native listener on the owned element). It is
a behavior change to React's interaction model — hence expressed as a REMOVED + ADDED
requirement motion, not a hidden addition. Delivery-failure safety is unaffected: core
`#deliver` catches everything and never throws out of the callback.

### D3: Solid gains a per-root container

Solid's `createRoot` creates a `rootContainer` `div`, renders the root content inside
it, appends the container to the shared host, and stamps identity on and
`addEventListener`s to the container. Registered-view reactive ownership is unaffected
(no registry here). The existing `renderer.container.children.length` (shared host)
assertions still hold — per-root containers replace root elements as the host's children
(2 then 1).

### D4: Core and render-root-projection unchanged

`RendererPort` signatures, `#deliver`/the failure channel, and the fake renderer (which
keeps its in-memory anchor) do not change. The core `render-root-projection` spec
describes identity on "the projected surface", which a container satisfies, so no
core-spec motion is needed.

## Risks / Trade-offs

- **[React interaction rewrite touches a shipped contract]** The synthetic model is
  replaced. → Expressed as a REMOVED + ADDED requirement motion; all interaction tests
  (two-editor, adapter) must pass unchanged in outcome; `removeRoot` now removes native
  listeners to satisfy Deterministic disposal.
- **[`elementForIdentity` now returns the container]** Tests reading authored attributes
  off the identity element break. → Enumerated in tasks: identity/`[data-velkren-root]`
  read the container; `version`/`role`/`tagName` read the container's child.
- **[Solid naming]** `container` (shared host) vs `rootContainer` (per-root). → Named
  distinctly across code, specs, and the option.

## Migration Plan

In-repo only.

1. React: relocate identity to `rootContainer`; replace synthetic wiring with a native
   listener on `rootContainer` (native snapshot; remove on `removeRoot`); drop the
   `isRoot` handler-prop block; `elementForIdentity` → `rootContainer`.
2. Solid: add a `rootContainer` per root; relocate identity and the interaction listener
   to it; `elementForIdentity` → `rootContainer`.
3. Update adapter + two-editor + extract-composition tests: identity assertions read the
   container, content assertions read its child.
4. Run the full Definition of Done; sync the two adapter deltas; archive (DoD again).

Rollback is a straight revert.

## Open Questions

- None; the dependent `add-view-registry` change builds on this.
