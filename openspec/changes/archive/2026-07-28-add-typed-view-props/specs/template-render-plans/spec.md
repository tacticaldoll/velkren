## MODIFIED Requirements

### Requirement: Normalized renderer-neutral render plans

Resolution SHALL produce a deeply frozen `RenderPlan` containing the selected template identity, the resolved component instance identity, and one or more named roots. Each root SHALL expose an abstract render-node tree whose nodes are one of two renderer-neutral shapes: a **primitive node**, carrying a node kind, strict-JSON attributes, ordered children, and named slots; or a **view node**, carrying a non-blank `viewId` and strict-JSON `props`, with no children or slots of its own. A RenderPlan MUST NOT contain DOM nodes, JSX elements, renderer objects, reactive primitives, or live mutable collections.

#### Scenario: Resolve a multi-root plan

- **WHEN** a component instance resolves a template that declares two named roots
- **THEN** the render plan exposes both named roots as an immutable abstract node tree without renderer or DOM types

#### Scenario: Immutable plan

- **WHEN** a caller attempts to mutate a resolved render plan, a node, or its attributes or props
- **THEN** the plan remains unchanged

#### Scenario: Strict-JSON attributes only

- **WHEN** a primitive template node declares an attribute value that is not strict JSON data
- **THEN** plan resolution fails explicitly identifying the offending node and attribute

#### Scenario: Strict-JSON props only

- **WHEN** a view template node declares a `props` value that is not strict JSON data
- **THEN** plan resolution fails explicitly identifying the offending node and prop

#### Scenario: A view node carries no children or slots

- **WHEN** a template node is authored as a view node (`{ node: "view", viewId, props }`)
- **THEN** the resulting render-plan node has no `children` or `slots` fields, distinguishing it structurally from a primitive node
