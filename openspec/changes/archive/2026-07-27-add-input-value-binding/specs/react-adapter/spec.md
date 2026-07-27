## ADDED Requirements

### Requirement: Controlled-value elements are never React-controlled

The adapter SHALL exclude a `value` attribute from the React props of an
`input`, `textarea`, or `select` primitive element, so React's own
controlled-input tracking never installs on that DOM node. The adapter
SHALL instead apply `value` to the rendered DOM node imperatively after
each render (initial mount and every commit), comparing against the
element's current `.value` property and skipping the assignment when
already equal, and preserving text selection across a necessary assignment
the same way the SolidJS adapter does. A registered view's subtree MUST NOT
be walked by this mechanism; its rendering stays entirely under the
registered view's own control.

#### Scenario: A controlled-value element stays editable

- **WHEN** a primitive `input` node carries a `value` attribute and mounts
  through the React adapter
- **THEN** the rendered `<input>` receives no `value` prop from React, its
  DOM `value` property is set imperatively after render, and typing into it
  is not immediately overwritten on the next render

#### Scenario: A same-value re-commit does not disturb the field

- **WHEN** a commit's `value` attribute for a controlled-value element
  equals its current `.value` property
- **THEN** the adapter does not reassign the property, and the user's caret
  position is unaffected

#### Scenario: A non-form element's value attribute is unaffected

- **WHEN** a primitive element whose kind is not `input`, `textarea`, or
  `select` carries a `value` attribute
- **THEN** the attribute is passed through as an ordinary React prop exactly
  as before this change, with no imperative post-render handling
