## Context

Two well-known platform/framework facts are the entire problem this change
solves:

1. **The HTML "dirty value flag."** Before any user edit or direct `.value =`
   assignment, an `<input>`'s `value` IDL property mirrors its `value`
   content attribute. The instant either happens, the flag becomes dirty and
   the content attribute permanently stops updating the live property —
   `element.setAttribute("value", x)` still changes what `getAttribute`
   returns, but no longer changes what the user sees or what `.value` reads.
   Solid's adapter (`applyAttributes`/`patchAttributes`,
   `packages/solid-adapter/src/index.ts:302-314,331-335`) calls
   `element.setAttribute(key, next)` unconditionally for every attribute,
   `value` included, and never reads or writes `.value` — confirmed by full
   read and grep. So today, the instant a user types into a Velkren-rendered
   Solid `<input>`, any later state-driven re-commit of `value` silently
   stops reaching the field.
2. **React's controlled-input machinery.** React's DOM host config treats an
   element with a `value` prop as _controlled_: it installs tracking on the
   DOM `.value` property and resyncs it to the prop on every render,
   regardless of native `input` events, unless a matching `onChange` handler
   lifts the new value back into props. `packages/react-adapter/src/index.ts`'s
   `renderNode` (lines 232-256) passes every `node.attributes` entry straight
   into the `props` object with no `onChange` anywhere in the file (confirmed
   by full read and grep) — so any `value` attribute today makes React treat
   the field as controlled-but-unresponsive: every keystroke fires, nothing
   lifts it back, and React resyncs `.value` right back to the stale prop on
   the next render, visually erasing the keystroke. React also logs a dev
   warning for this shape, and `react-adapter.test.ts` (lines 118-141) fails
   the whole suite on any console warning — so this is a live trap, not a
   theoretical one.

**Vue is different, and does not need fixing.** `packages/vue-adapter/src/index.ts`
imports `h`/`render` directly from the `"vue"` package (not a custom
`createRenderer` with hand-rolled DOM ops), so every commit goes through
Vue's real `@vue/runtime-dom` patch pipeline. Reading
`node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js` directly:
`shouldSetAsProp` (line 759) returns `key in el` for any key not explicitly
excluded, which is `true` for `"value"` on an `<input>` — routing it to
`patchDOMProp` (line 579), which reads `oldValue = el.value` (the live
property, dirty-flag-aware) and only assigns `el.value = newValue` when
`oldValue !== newValue` (lines 587-597). This is exactly the "skip if
unchanged" mitigation this change needs, already present, unconditionally,
for every `h()`/`render()` call regardless of whether the vnode came from
Vue's compiler or hand-written code as here. **No Vue adapter source change
is needed or wanted; a test proves this rather than papering over it with an
unnecessary parallel implementation that could drift from Vue's own.**

`packages/core/src/state-binding.ts`'s `apply` (line 109) calls
`this.projection.commit(root, derive(value))`, which
(`packages/core/src/projection-runtime.ts:127-138`) calls
`state.port.commit(...)` — the exact same `RendererPort.commit` used by
every other commit path (interaction-driven re-render, a direct
`projection.commit` call in a test). A fix at the attribute-application
layer in each adapter therefore covers state-binding commits and every other
commit path uniformly; there is no separate code path to special-case.

## Goals / Non-Goals

**Goals:**

- A state-bound `value` on a primitive `<input>`/`<textarea>` reflects into
  the live DOM property (not just the attribute) on Solid.
- The same on React, without engaging React's controlled-input machinery at
  all (never install it, rather than try to satisfy it).
- A same-value re-commit (the common "echo back what was just typed" case)
  never disturbs the caret, on all three adapters.
- A genuinely different, external value change while a field has focus does
  not permanently lose the caret either, on Solid and React (best-effort
  selection save/restore around the assignment; Vue's own behavior here is
  whatever Vue's own `patchDOMProp` already does, which this change does not
  touch or improve).
- Mechanism confined entirely to each adapter package; no `@velkren/core`
  change, no renderer type crossing into a core contract.

**Non-Goals:**

- `checked` (checkbox/radio), `selected` (`<option>`), or any other
  form-control state beyond text `value` — explicitly deferred by the
  backlog to a follow-on change.
- Reordering/keyed list reconciliation for a list of inputs — a separate,
  already-queued backlog item (`add-keyed-node-reconcile`), unrelated to this
  change's index-based reconciliation.
- IME composition correctness beyond what the skip-if-equal mechanism
  naturally provides. No composition-event-specific code is added.
- Touching Vue's rendering pipeline in any way.

## Decisions

- **Scope the mechanism by tag, on both Solid and React** — not by a
  capability check. An earlier version of this design used `"value" in
element` on Solid (mirroring Vue's own `shouldSetAsProp` check), reasoning
  it would generalize to `<textarea>` for free. That reasoning was wrong:
  `"value" in element` is also true for `<li>`, `<meter>`, and `<progress>`,
  whose `value` IDL property is a _numeric_ WebIDL type (`long`/`double`),
  not a string — assigning a string through it silently coerces
  (`element.value = "abc"` on an `<li>` becomes `"0"`), corrupting rather
  than preserving an ordinary ordinal attribute. Verified directly against
  happy-dom: `li.value` reads back `"0"` after assigning `"abc"`. Both
  adapters now use the same `CONTROLLED_VALUE_TAGS = new Set(["input",
"textarea", "select"])` allowlist, matching exactly the tags whose
  `value` is string-typed and exactly the tags React's own controlled-input
  detection already targets — removing both the bug and the Solid/React
  scoping asymmetry the earlier design introduced.
- **Never let React see a `value` prop on a controlled tag, rather than try
  to satisfy React's controlled contract.** Passing `value` with a matching
  `onChange`/`readOnly` would still leave React owning the DOM `.value`
  property (tracked and resynced every render), which is exactly the
  "resyncs and fights back" behavior this change needs to avoid. Omitting
  `value` from props entirely means React never installs that tracking on
  the node in the first place, so there is nothing to fight — the adapter,
  not React, owns `.value` post-render, mirroring the file's own existing
  `stampIdentity` precedent ("a re-render alone would not restore an
  out-of-band-removed attribute" — same reasoning, same shape: something the
  adapter must repair imperatively after React's render because React does
  not manage it).
- **The value-property helper is duplicated per adapter, not shared.** Each
  adapter package already duplicates small helpers (`stringifyAttribute`,
  `normalizeOptions`) rather than sharing a utility package; `applyValueProperty`
  follows the same, already-established pattern. It is short (under 20
  lines) and adapter-specific enough (each takes a plain `HTMLElement`) that
  a shared package would be disproportionate ceremony for this increment.
- **Selection save/restore is guarded, not assumed.** `selectionStart`/
  `selectionEnd`/`selectionDirection`/`setSelectionRange` throw
  `InvalidStateError` on `<input>` types that do not support text selection
  (`number`, `email`, `date`, `color`, etc., per the HTML Standard). The
  helper wraps both the read and the restore in `try`/`catch` and silently
  skips selection handling when unsupported, rather than assuming every
  `value`-carrying element is a plain text field.
- **React applies `value` through a callback `ref` on the element itself,
  not a post-render DOM tree walk.** An earlier version of this design
  walked the rendered DOM in lockstep with the `RenderNode` tree by child
  index, mirroring `fix-solid-commit-reconcile`'s index-based reconciliation.
  That assumption does not hold for React specifically: `ReactView` is typed
  as `FunctionComponent<JsonObject>`, with no guarantee (unlike Solid's
  `SolidView = (props) => HTMLElement`) that a registered view renders
  exactly one top-level DOM node — a view returning a Fragment with multiple
  roots, or `null`, would desync a by-index walk for every sibling
  positioned after it in the same parent, applying a value assignment to
  the wrong element. A callback `ref` sidesteps this entirely: `renderNode`
  attaches an inline ref callback to `input`/`textarea`/`select` elements'
  props (in addition to excluding `value` itself), and the callback receives
  the _exact_ DOM node it was attached to — regardless of what any sibling
  view renders — whenever React (re)commits that element. Since `renderNode`
  is called fresh on every render, the ref callback is a new function
  identity each time, so React invokes it (old ref with `null`, immediately
  followed by the new ref with the node, for an unchanged underlying DOM
  element) on every commit, synchronously, inside the same `flushSync` this
  file already wraps every render in — no separate walk, no tree-shape
  assumption, no risk of misalignment from Fragments or `null`-rendering
  views.
- **Removing `value` from a later commit clears the property**, not just the
  attribute, on Solid (assigning `""` through the same guarded path) so a
  disappearing `value` field does not leave a stale live value behind.

## Risks / Trade-offs

- **The shared tag-based exclusion list could miss a future controlled-value
  element** (e.g. a custom element with a string `value` IDL property
  Velkren later wants to treat this way) → acceptable for a first
  increment: the backlog explicitly scopes this to "a first text-field
  proof," and `CONTROLLED_VALUE_TAGS` is a single, easily-extended constant
  in each adapter.
- **A capability check (`"value" in element`) looked more general but was
  actually unsafe** — caught during review, not shipped: it does not
  distinguish a string-typed `value` (input/textarea/select) from a
  numeric-typed one (`<li>`, `<meter>`, `<progress>`), and assigning a
  string through a numeric IDL setter silently coerces it. The tag
  allowlist avoids this entirely by construction; a regression test
  (`<li value>` unaffected) guards against reintroducing the capability
  check later.
- **Duplicated `applyValueProperty` logic across Solid and React could
  drift** → mitigated by keeping the function small and behaviorally
  identical by construction (same skip-if-equal + guarded selection
  save/restore), and by testing both adapters against the same assertions.
- **A ref callback fires on every commit even when the underlying DOM node
  is unchanged** (since it's a fresh closure each render) → not a real cost:
  `applyValueProperty`'s own skip-if-equal check makes the extra
  invocations cheap no-ops, and this is the same "runs every commit
  regardless" shape `stampIdentity`'s commit-repair already has in this
  file.
- **React does not clear the DOM `value` property when a later commit stops
  including a `value` attribute**, unlike Solid (which explicitly clears it
  via `applyValueProperty(element, "")` on removal). This is a real,
  accepted asymmetry: `renderNode` rebuilds the vdom fresh on every commit
  with no memory of the _previous_ node (unlike Solid's `patchNode`, which
  receives both old and new nodes explicitly), so there is no natural place
  to detect "value was present before, now it's gone" without threading
  extra state through a function that is otherwise stateless by design. In
  practice this does not arise: a state-binding `derive` function that
  manages a field's `value` does so consistently, not intermittently. Not
  fixed in this increment; worth revisiting only if a real use case needs
  it.
- **Vue's own `patchDOMProp` behavior is outside this repo's control** and
  could change in a future Vue release → acceptable; this is the same
  “adopt the framework’s real primitive” trade-off every adapter already
  makes (e.g. relying on React’s or Solid’s own reconciler), not a new class
  of risk this change introduces.

## Migration Plan

Additive/corrective only, confined to two adapter packages' internal
attribute-handling functions. No public API, type, or signature changes; no
rollback beyond reverting the two files.

## Open Questions

None outstanding.
