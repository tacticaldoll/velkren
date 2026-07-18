## Why

The neutral interaction port was designed so any UI framework can be an adapter,
with the declarative `registerInteraction` operation (design decision D1 of
`add-neutral-interaction-port`) built specifically for a reconciler framework
whose managed tree cannot be listened to from outside. That design is still
unvalidated: the only real adapter is SolidJS, which attaches capture imperatively
(`addEventListener` after `createRoot`) — the easy case. React is the forcing
function that proves (or breaks) the declarative shape, and confirms `@velkren/core`
stays renderer-independent against a second, structurally different framework.

The failure-channel correction this adapter would otherwise have exposed already
landed independently (`fix-interaction-failure-channel`), so this change is scoped
to the adapter and its validation, consuming the existing `onFailure` channel.

## What Changes

- Add a new `@velkren/react-adapter` package: a React `RendererPort` implementing
  `createRoot`/`commit`/`removeRoot` through `react-dom/client`, and
  `registerInteraction` woven into React's own event system. Because handlers
  cannot be attached to a React tree from outside, the adapter stores registered
  interest in a mutable per-root store that its rendered handlers read at event
  time; registration needs no re-render and works before or after mount. React and
  DOM types live only in this package; `@velkren/core` stays free of them.
- Render synchronously at the port boundary: `createRoot`/`commit` use
  `react-dom`'s `flushSync` so the port's synchronous `readIdentity` holds against
  React's otherwise-scheduled reconciler, and the runtime-assigned identity is
  stamped imperatively on the mounted node after each render (a re-render alone does
  not restore an out-of-band-removed attribute) — satisfying the commit-repair
  contract as the SolidJS adapter does.
- Capture produces an immutable snapshot at the adapter boundary; a failed
  delivery (schema-invalid payload, etc.) surfaces through the runtime's existing
  `onFailure` channel, not a throw the synthetic-event handler would swallow.
- Add a React validation that composes the minimal component/template/event/layout
  set through the adapter and asserts the same core guarantees as the two-editor
  scenario — identity isolation, business-event emission through the
  interaction-binding contract, and scoped disposal — proving core semantics hold
  on a second framework.

## Capabilities

### New Capabilities

- `react-adapter`: an isolated React `RendererPort` adapter — reconciler-driven
  mount/commit/unmount with synchronous flushing, declarative interaction
  registration woven into React's event system, an immutable input-snapshot
  boundary, semantic-event emission through the interaction-binding contract,
  deterministic disposal, and a validation that core semantics stay
  renderer-independent on a reconciler framework.

### Modified Capabilities

<!-- none: the failure-channel and faithful-fake corrections shipped in fix-interaction-failure-channel -->

## Impact

- **Code**: new `packages/react-adapter/` (src + tests). No `@velkren/core`
  change — it consumes the already-shipped `onFailure` channel.
- **Dependencies**: pinned `react` + `react-dom` (18.x) and `@types/react`/`@types/react-dom`
  added to the react-adapter package only. Tests run in a package-scoped happy-dom
  environment (per-file docblock, not the core Node-only env) and may need
  `deps.inline: ["react", "react-dom"]` for ESM interop; no `act`/act-environment is
  used (the rendered tree holds no React state to flush). `@velkren/core` gains no
  dependency.
- **APIs**: none changed; a new adapter package is added.
- **Non-goals**: no mixed-framework tree, no plugin-based renderer selection, no
  Vue. **Not** refactoring the archived two-editor app into a renderer-agnostic
  shared composition — the React validation is a parallel proof covering the same
  guarantees; a gold-standard shared-composition extraction (and a common
  adapter test-drive surface) is a deliberate deferred follow-up.
