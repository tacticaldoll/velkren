## MODIFIED Requirements

### Requirement: Normalized renderer-neutral render plans

Resolution SHALL produce a deeply frozen `RenderPlan` containing the selected template identity, the resolved component instance identity, and one or more named roots. Each root SHALL expose an abstract render-node tree whose nodes are one of two renderer-neutral shapes: a **primitive node**, carrying a node kind, strict-JSON attributes, ordered children, and named slots; or a **view node**, carrying a non-blank `viewId` and strict-JSON `props`, with no children or slots of its own. Either node shape MAY additionally carry an optional renderer-neutral `key` string, used by a renderer adapter to reconcile a children list by identity rather than position. A RenderPlan MUST NOT contain DOM nodes, JSX elements, renderer objects, reactive primitives, or live mutable collections.

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

#### Scenario: A node's key carries through resolution unchanged

- **WHEN** a template node (primitive or view) declares a `key`
- **THEN** the corresponding render-plan node carries the same `key` string

## ADDED Requirements

### Requirement: Sibling key consistency at template-authoring time

Within one template node's `children` array, either every sibling SHALL declare a non-blank `key` or none SHALL, and no two siblings SHALL declare the same `key`; a template definition violating either rule MUST fail explicitly at definition time. This validation applies only to the template-authoring path (`createTemplateClass`); a `RenderNode` a caller commits directly (for example, the result of a `state-binding` derivation) is not validated for key consistency by core, the same unchecked posture already applied to that node's other fields at the `RendererPort.commit` boundary.

#### Scenario: Reject a blank key

- **WHEN** a template node declares a `key` that is an empty or whitespace-only string
- **THEN** template definition fails explicitly

#### Scenario: Reject mixed keyed and unkeyed siblings

- **WHEN** a template node's `children` array has some entries carrying a `key` and others not
- **THEN** template definition fails explicitly

#### Scenario: Reject duplicate sibling keys

- **WHEN** two entries in the same `children` array declare the same `key`
- **THEN** template definition fails explicitly

#### Scenario: A directly-committed RenderNode is not key-validated

- **WHEN** a caller (for example a `state-binding` derivation) builds a `RenderNode` directly and commits it through `projection.commit` without going through template authoring
- **THEN** core performs no key-consistency check on that node, consistent with its existing unchecked handling of that node's other fields at the same boundary
