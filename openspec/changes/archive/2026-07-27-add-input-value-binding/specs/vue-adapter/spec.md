## ADDED Requirements

### Requirement: The native renderer already satisfies value-crossing

The adapter SHALL rely on Vue's own `render()`/`patchProp` pipeline to apply
a `value` attribute to a form element as a live DOM property with
skip-if-equal semantics, requiring no adapter-specific code. The adapter
MUST NOT add a parallel value-handling mechanism alongside Vue's own.

#### Scenario: A same-value re-commit does not disturb the field

- **WHEN** a primitive `input` node carries a `value` attribute equal to the
  element's current `.value` property and a commit re-renders it through
  the Vue adapter
- **THEN** the element's `.value` property is not reassigned and the user's
  caret position is unaffected

#### Scenario: A different value updates the live property

- **WHEN** a commit's `value` attribute differs from the element's current
  `.value` property
- **THEN** Vue's own renderer assigns the new value to the DOM property,
  and the adapter's code performs no additional handling
