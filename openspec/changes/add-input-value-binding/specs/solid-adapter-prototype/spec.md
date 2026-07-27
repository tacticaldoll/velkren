## ADDED Requirements

### Requirement: State-bound value crosses as a live DOM property

The adapter SHALL apply a `value` attribute to an element that has a
settable `value` IDL property as a live DOM property assignment rather than
`setAttribute`, on both initial mount and every later commit. The adapter
SHALL compare the incoming value against the element's current `.value`
property and SHALL skip the assignment when they are already equal. When an
assignment is necessary, the adapter SHALL preserve the element's current
text selection (`selectionStart`, `selectionEnd`, `selectionDirection`)
across the assignment when the element supports text selection, clamping
the restored range to the new value's length. A later commit that removes
the `value` attribute SHALL clear the property through the same guarded
path rather than calling `removeAttribute`.

#### Scenario: A same-value re-commit does not disturb the field

- **WHEN** a primitive element with a settable `value` property already
  holds a string via user input, and a commit arrives whose `value`
  attribute equals that same string
- **THEN** the adapter does not reassign the element's `value` property, and
  the user's caret position is unaffected

#### Scenario: A different value updates the property and preserves selection

- **WHEN** a commit's `value` attribute differs from the element's current
  `.value` property
- **THEN** the adapter assigns the new value to the property and restores
  the element's prior selection range, clamped to the new value's length,
  when the element supports text selection

#### Scenario: Selection is not assumed on every value-bearing element

- **WHEN** the adapter applies a value-property assignment to an element
  whose type does not support text selection (for example, a numeric or
  date input)
- **THEN** the assignment still succeeds and no error propagates from the
  attempted selection save or restore

#### Scenario: Removing value clears the live property

- **WHEN** a commit's new attributes no longer include `value` for an
  element that previously had one applied as a property
- **THEN** the adapter clears the element's `value` property through the
  same guarded assignment path
