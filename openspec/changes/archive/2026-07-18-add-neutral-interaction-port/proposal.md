## Why

Velkren's constitution promises that renderers are one-way projections and that
core never depends on renderer-specific types. The **output** half of that
promise is real: `RendererPort` drives any framework with renderer-neutral
render nodes. The **input** half is not. Today the only way an interaction
becomes a semantic event is for application code to reach past the port —
`renderer.container.querySelector([data-velkren-root])` plus a native
`addEventListener` — which is exactly the DOM-selector coordination the
constitution forbids. This works for SolidJS by accident of it rendering real
DOM; it would not work for a framework whose managed tree cannot be listened to
from outside (e.g. React). Making the port symmetric — so each framework
captures interactions its own idiomatic way and core only ever sees an immutable
snapshot — is what actually unlocks "one runtime, one framework, any framework."

## What Changes

- Add a **declarative interaction-registration** operation to `RendererPort`.
  Core registers interest ("this root's `activate` interaction maps to a
  handler") _before or during_ projection; the adapter decides how to wire it
  using its framework's native event system. Core never learns the capture
  mechanism.
- Add an **interaction-binding** contract in core that maps a
  `(RootHandle, interaction-type)` pair to an `EventClass` and a payload
  projection, and dispatches the semantic event when the adapter reports an
  interaction. The immutable-snapshot boundary (only frozen JSON crosses inward;
  no native event or live node) becomes an owned core contract rather than an
  adapter convenience.
- Refactor the SolidJS adapter to capture interactions through its own event
  layer and satisfy the port's input operation — removing any reliance on an
  external `addEventListener` against a queried element.
- Rewrite the two-editor validation so interactions flow through the port and
  the interaction-binding contract, deleting the `querySelector` +
  `addEventListener` bypass. The validation must still emit `editor.submitted`
  across template changes and isolate per-editor cleanup.
- Prove framework-neutrality of the input side at the core boundary: the
  in-memory **fake renderer** implements the interaction operation in Node with
  no DOM, so a second real framework adapter is _not_ required to demonstrate
  that core stays renderer-independent. (A React/Vue adapter that exercises the
  same contract is deliberately deferred to its own change.)

## Capabilities

### New Capabilities

- `interaction-binding`: the framework-neutral input side of projection — a
  declarative registration on the renderer port, an owned immutable-snapshot
  boundary, and the `(root, interaction-type) → EventClass + payload` mapping
  that turns a reported interaction into a dispatched semantic event without core
  learning how the interaction was captured.

### Modified Capabilities

- `render-root-projection`: the `RendererPort` contract gains the declarative
  interaction-registration operation and its validation; the fake renderer
  implements it in Node.
- `solid-adapter-prototype`: the adapter captures interactions through its own
  framework event layer to satisfy the port input operation, rather than through
  an externally-attached native listener.
- `two-editor-validation`: interactions are routed through the port and
  interaction-binding contract instead of application-level DOM selection and
  native listeners.

## Impact

- **Code**: `packages/core/src/renderer-port.ts` (port shape + validation),
  a new interaction-binding module in `packages/core/src`,
  `packages/core/src/projection-runtime.ts` (wire registration through the
  managed root lifecycle), `packages/core/src/fake-renderer.ts`,
  `packages/solid-adapter/src/index.ts`, and
  `packages/two-editor-validation/src/index.ts`. Public exports in
  `packages/core/src/index.ts` grow by the interaction-binding surface.
- **APIs**: `RendererPort` gains one operation — a **BREAKING** change for any
  external port implementation (only the in-repo Solid and fake renderers exist).
- **Dependencies**: none added.
- **Non-goals**: no second concrete framework adapter, no mixed-framework tree,
  no plugin-based renderer selection (constructor injection stays); these remain
  deferred.
