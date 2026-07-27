## 1. Solid adapter

- [x] 1.1 Add an `applyValueProperty(element, next)` helper in
      `packages/solid-adapter/src/index.ts`: skip if `element.value === next`;
      otherwise save `selectionStart`/`selectionEnd`/`selectionDirection`
      (guarded in try/catch), assign `.value`, restore the selection clamped
      to the new length (guarded in try/catch)
- [x] 1.2 Add the shared `CONTROLLED_VALUE_TAGS = new Set(["input",
"textarea", "select"])` allowlist (not a `"value" in element`
      capability check — that also matches `<li>`/`<meter>`/`<progress>`,
      whose `value` is a numeric IDL property that silently coerces a
      string, corrupting it; caught in review, see design.md) and wire
      `applyAttributes` (initial mount) to use `applyValueProperty` for the
      `value` key only when the element's tag is in the set, falling
      through to `setAttribute` for every other key
- [x] 1.3 Wire `patchAttributes` (commit) the same way, including the
      removal branch: clear the property via `applyValueProperty(element, "")`
      when `value` is present in `oldAttributes` but absent from
      `newAttributes` and the element's tag is in `CONTROLLED_VALUE_TAGS`,
      instead of `removeAttribute`
- [x] 1.4 Add a regression test proving a non-form element (`<li value>`)
      is unaffected and not corrupted

## 2. React adapter

- [x] 2.1 Add a `CONTROLLED_VALUE_TAGS = new Set(["input", "textarea", "select"])`
      constant and the same `applyValueProperty(element, next)` helper in
      `packages/react-adapter/src/index.ts`
- [x] 2.2 In `renderNode`, exclude the `value` attribute from `props` when
      `CONTROLLED_VALUE_TAGS.has(node.kind)`
- [x] 2.3 In `renderNode`, when `CONTROLLED_VALUE_TAGS.has(node.kind)`, add a
      `ref` callback to `props` that applies `node.attributes.value` (when
      present) to the DOM node it receives via `applyValueProperty`, ignoring
      a `null` ref (unmount/ref-detach call)

## 3. Vue adapter (no source change)

- [x] 3.1 No change to `packages/vue-adapter/src/index.ts` — confirmed by
      design.md's reading of `@vue/runtime-dom`'s `patchDOMProp`/`shouldSetAsProp`

## 4. Tests

- [x] 4.1 `packages/solid-adapter/test/solid-adapter.test.ts`: a test that
      mounts an `<input>` with a `value` attribute via `state-binding`,
      simulates a user setting `.value` directly (as typing would), commits
      the same value again, and asserts the property (not just the
      attribute) reflects it and a set selection range survives an
      equal-value re-commit
- [x] 4.2 Same test shape in `packages/react-adapter/test/react-adapter.test.ts`,
      confirming no console warning fires (the existing suite already fails
      on any) and the field is genuinely editable (a native `input` event
      after mount still reflects in `.value` without React snapping it back
      on the next commit)
- [x] 4.3 A new test in `packages/vue-adapter/test/vue-adapter.test.ts`
      proving the existing renderer already satisfies the same guarantee
      with zero adapter code change
- [x] 4.4 A selection-preservation test on Solid and React: set a selection
      range, commit a genuinely different value, assert the range is
      restored (clamped to the new length)
- [x] 4.5 A guarded-selection test (Solid or React, no need to triplicate):
      an `<input type="number">` (or another selection-unsupporting type)
      with a `value` crossing does not throw

## 5. Verification

- [x] 5.1 Run `npm run build`, `npm test`, `npm run lint`,
      `npm run format:check` and confirm all four pass
- [x] 5.2 Confirm no adapter-package source change beyond
      `solid-adapter/src/index.ts` and `react-adapter/src/index.ts` --
      confirmed via `git status`: no `vue-adapter/src/` change, only its test
      file
