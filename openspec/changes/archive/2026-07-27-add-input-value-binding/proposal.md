## Why

The reactive loop (`interaction → event → listener → state → binding →
commit`) already re-derives and re-commits a `RenderNode` on every state
change, but every adapter today treats every attribute — including `value`
on an `<input>` — as a plain string reflected generically: Solid via
`setAttribute`, React via a raw prop passed straight into `createElement`.
Neither is a real, editable, state-driven text field: Solid's
`setAttribute("value", …)` stops reflecting into the live `.value` property
the instant a user types (the HTML "dirty value flag" permanently decouples
the attribute from the property), and React's generic prop pass-through
makes any `<input value="…">` a React-controlled component with no
`onChange`, which locks the field read-only (and trips React's own
"controlled input without onChange" warning — a warning this repo's test
suites already fail the build on). This change makes `value` a first-class,
adapter-managed crossing on Solid and React so a state-bound text input
stays genuinely editable. Vue needs no source change: its own `render()`
already special-cases `value` at the DOM-property level with the exact
skip-if-equal semantics this change wants, verified by reading
`@vue/runtime-dom`'s `patchDOMProp` directly (see design.md) — a test is
added to prove it, not a fix.

## What Changes

- **Solid** (`packages/solid-adapter/src/index.ts`): `applyAttributes` (initial
  mount) and `patchAttributes` (commit) special-case the `value` key for
  `input`/`textarea`/`select` elements (`CONTROLLED_VALUE_TAGS`, the same
  allowlist as React — see design.md for why a broader capability check is
  unsafe): instead of `setAttribute`, they compare `element.value` to the
  incoming string and, only if different, assign `element.value` directly,
  saving and restoring `selectionStart`/`selectionEnd`/`selectionDirection`
  around the assignment (guarded, since some `<input>` types throw on
  selection access). Removing `value` from a later commit clears the
  property the same way rather than calling `removeAttribute`.
- **React** (`packages/react-adapter/src/index.ts`): `renderNode` excludes
  `value` from the generic props object for the three tags React treats as
  controlled form elements (`input`, `textarea`, `select`), so React's own
  controlled-input machinery never installs on that DOM node — there is
  nothing for it to "fight back" with on the next render. Instead, those
  elements get an inline callback `ref` in their props that applies `value`
  to the exact DOM node it is attached to, with the same skip-if-equal +
  selection-preserving logic as Solid, whenever React (re)commits it — a new
  ref-function identity each render means the callback fires every commit,
  synchronously inside the existing `flushSync`. This avoids a separate
  post-render DOM tree walk entirely, which would otherwise have to assume
  every registered view renders exactly one DOM node (true for Solid's
  `SolidView` type, not guaranteed for React's `FunctionComponent`-typed
  `ReactView`).
- **Vue**: no source change. A new test proves the existing `h()`/`render()`
  path already reflects a state-bound `value` into the live DOM property
  with skip-if-equal semantics (via Vue's own `patchDOMProp`), without
  disturbing the caret on a same-value re-commit.
- **`@velkren/core`**: unchanged. No renderer type, no new contract; the
  mechanism is entirely inside each adapter, consistent with every other
  `RendererPort` guarantee.
- **BREAKING**: none. `value` remains an ordinary string in a `RenderNode`'s
  `attributes`; no public type or signature changes on any adapter or core
  export. The only behavior change is _how_ the existing `value` attribute
  key is realized in the DOM on Solid and React.

## Capabilities

### New Capabilities

<!-- none: this extends three existing adapter capabilities -->

### Modified Capabilities

- `solid-adapter-prototype`: a state-bound `value` attribute on an
  `input`/`textarea`/`select` primitive element now applies as a live DOM
  property (skip-if-equal, selection preserved) instead of `setAttribute`,
  so a real user edit is not lost on the next commit.
- `react-adapter`: `value` is excluded from the props of `input`/`textarea`/
  `select` primitive elements and instead applied imperatively after each
  render, so React's controlled-input machinery never engages and the field
  stays genuinely editable.
- `vue-adapter`: no requirement _behavior_ changes — a new scenario documents
  that the existing renderer already satisfies the value-crossing guarantee
  via Vue's own `patchDOMProp`, with no adapter code change.

## Impact

- **Code**: `packages/solid-adapter/src/index.ts`,
  `packages/react-adapter/src/index.ts`. No `packages/vue-adapter/src/index.ts`
  change. No `@velkren/core` change.
- **APIs**: none changed. `RenderNode.attributes.value` remains a plain
  string; no new export on any package.
- **Dependencies**: none added.
- **Non-Goals**: no non-text controlled inputs (checkbox `checked`, `select`
  option state) — deferred, per the backlog, to a follow-on change once a
  first text-field proof lands. No stable-key list reconciliation (a
  reordering `<input>` list is `add-keyed-node-reconcile`, a separate,
  already-queued backlog item this change does not depend on or block). No
  IME-composition-specific handling beyond what falls out of the
  skip-if-equal/selection-preserving mechanism.
