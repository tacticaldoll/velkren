## Why

Both renderer adapters anchor two runtime concerns — the identity attribute and the
interaction capture — on the **rendered root element** itself: Solid stamps identity on
and `addEventListener`s to the `document.createElement(node.kind)` root element, and
React stamps identity on `container.firstElementChild` and wires synthetic handler
props on the rendered root. That couples the runtime's anchor to whatever the root
element happens to be. It also blocks a coming capability (`add-view-registry`): if a
component's root view were a framework-native component, the adapter would lose the
element it stamps identity on and listens to.

This change relocates both concerns onto the adapter-owned **per-root container** (the
mount boundary), with **no new feature** and **no change to any port-observable runtime
guarantee** — every existing guarantee (identity, commit-repair, interaction delivery,
two-editor isolation/disposal) still holds. The React interaction _mechanism_ does
change (synthetic handler props → a native container listener; **BREAKING within
React**), which is why the React interaction requirement is re-expressed rather than
silently kept. It is landed on its own, ahead of the view-registry feature that depends
on it, per the repo's `fix-interaction-failure-channel → add-react-adapter` precedent.

## What Changes

- **Anchor identity on the per-root container.** Each adapter stamps
  `PROJECTION_IDENTITY_ATTRIBUTE` on the per-root container element (React's existing
  `rootContainer`; a new per-root container in Solid), repairs it there on commit, and
  reads it from there. The rendered content lives inside the container.
- **Anchor interaction capture on the per-root container.** Each adapter attaches a
  **native** listener to its per-root container; an interaction on any element mounted
  inside bubbles to it, is snapshotted at the boundary, and delivered through the port.
  **BREAKING (React):** this replaces React's synthetic-handler-prop wiring with a
  native container listener — required so the anchor no longer depends on the rendered
  element. `removeRoot` removes the listener; `snapshotReactEvent` becomes a
  native-event snapshot like Solid's.
- `elementForIdentity(identity)` now resolves the per-root container (which carries the
  identity); tests reading authored content read the container's child.
- The `RendererPort` contract and `@velkren/core` (including `render-root-projection`
  and the fake renderer) are unchanged — only where the adapters anchor moves.

## Capabilities

### New Capabilities

<!-- none: this refactors the two renderer-adapter capabilities -->

### Modified Capabilities

- `react-adapter`: identity and interaction anchor on the per-root container; the
  interaction model changes from synthetic handler props to a native container listener.
- `solid-adapter-prototype`: identity and interaction anchor on a new per-root
  container.

## Impact

- **Code**: `packages/react-adapter/src/index.ts` (move identity stamp/read/repair and
  interaction wiring from `firstElementChild`/synthetic props to the `rootContainer`
  native listener; drop `INTERACTION_HANDLER_PROPS`/`isRoot` handler wiring; native
  snapshot; remove the listener in `removeRoot`; `elementForIdentity` → container) and
  `packages/solid-adapter/src/index.ts` (add a per-root container; move identity and the
  interaction listener to it; keep the shared-host `container` option name distinct).
  Adapter, two-editor, and extract-composition tests update where they read the identity
  element (now the container) vs authored content (its child).
- **APIs**: none changed; `elementForIdentity` returns the container.
- **Dependencies**: none.
- **Non-goals**: no view registry (that is `add-view-registry`, which depends on this);
  no `@velkren/core` change; no change to port-observable guarantees. The one deliberate
  mechanism change is React's capture (synthetic → native listener), BREAKING within
  React and re-expressed in the spec.
