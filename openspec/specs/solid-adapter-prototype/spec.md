# SolidJS Adapter Prototype

## Purpose

Define an isolated SolidJS RendererPort adapter package: reactive mount/commit/unmount onto a real DOM surface, a native input snapshot boundary, semantic-event emission through core contracts, and deterministic disposal — adopting SolidJS only behind the port while @velkren/core stays free of SolidJS, DOM, and reactive dependencies.

## Requirements

### Requirement: Isolated SolidJS adapter package

SolidJS SHALL be adopted only inside a dedicated adapter package that implements the framework-independent `RendererPort`. `@velkren/core` MUST NOT depend on SolidJS, import DOM or reactive types, or import anything from the adapter package, and the adapter MUST depend on `@velkren/core` only through its public contracts.

#### Scenario: Core stays free of the adapter and SolidJS

- **WHEN** the core package is built and its test suite runs in Node.js
- **THEN** it compiles and passes without SolidJS, DOM, or reactive dependencies and without importing the adapter

#### Scenario: Adapter implements the port

- **WHEN** the adapter package is loaded
- **THEN** it exposes a renderer that satisfies the `RendererPort` contract and consumes `@velkren/core` only through its public API

### Requirement: Reactive mount and commit through the port

The adapter SHALL mount a render plan onto a real DOM surface using SolidJS reactivity, driven only through the `RendererPort` operations. It SHALL own a per-root container element (`rootContainer`, distinct from the shared-host `container` option) into which it renders the root content, and it MUST apply the runtime-assigned permanent identity attribute on that container at creation and re-apply it on every commit, repairing it if lost, without deriving identity or ownership from the DOM.

A commit SHALL reconcile the projected content in place rather than rebuilding it. A primitive element (one the adapter creates itself via `document.createElement`, i.e. not a registered view) whose `kind` is unchanged across a commit MUST keep its existing DOM node; the adapter MUST apply only the changed attributes to that node, remove attributes absent from the new node, and reconcile its children in place — adding or removing child elements only where the child list changed and leaving unchanged sibling elements untouched. The adapter MUST NOT destroy and recreate an unchanged primitive element on commit. When a children array is fully keyed (every child carries a non-blank `key`) or the corresponding prior children array was fully keyed, the adapter MUST reconcile that array by key rather than position: a child whose key is reused across the commit MUST keep its existing DOM element (patched in place, or rebuilt only if its own kind/variant changed); a new key not already claimed by an earlier sibling in the same commit MUST get a freshly built element; and — since the prior array is not guaranteed to have been fully keyed itself, and the new array is not guaranteed to have unique keys (a caller committing a `RenderNode` directly, bypassing template-authoring validation, may transition a children array between not-fully-keyed and fully-keyed across a commit, or may repeat a key) — every DOM child element not reused by a matched key MUST be removed, not only elements that were previously keyed, and a duplicate key within the new array MUST NOT cause any child to be silently dropped (each duplicate beyond the first is treated as unmatched and gets a freshly built element). A children array that is not fully keyed on either side continues to reconcile by position exactly as before — index-based reconciliation, where a node's position among its siblings identifies it, remains the default and is only superseded when at least one side carries a full set of keys. A registered view remains a self-contained leaf and MAY be re-instantiated on commit, since it receives the node's `props` as plain props.

#### Scenario: Mount projects a plan to the DOM

- **WHEN** the runtime projects a component instance's render plan through the adapter
- **THEN** each root's per-root container is created on the DOM surface carrying its runtime-assigned identity attribute, with the rendered content inside it

#### Scenario: Commit repairs identity

- **WHEN** a root's identity attribute is removed from its container and the root is committed again
- **THEN** the adapter restores the runtime-assigned identity attribute on the container while updating content

#### Scenario: Commit preserves an unchanged primitive element

- **WHEN** a root is committed again with a same-shape node whose only difference is a changed attribute on a primitive element
- **THEN** that element is the same DOM node as before the commit, with the changed attribute applied, rather than a newly created element

#### Scenario: Commit applies attribute and structural changes in place

- **WHEN** a root is committed with a node that changes a primitive element's attributes, drops one of its attributes, and adds and removes a child
- **THEN** the adapter updates and removes attributes on the existing element, adds and removes only the affected child elements, and leaves the unchanged sibling elements in place as the same DOM nodes

#### Scenario: A keyed list reorders without losing element identity

- **WHEN** a fully-keyed children array is committed again with the same keys in a different order
- **THEN** each key's DOM element is the same node as before the commit, now in the new order, with no element destroyed and recreated solely due to the reorder

#### Scenario: A keyed list inserts and removes by key

- **WHEN** a fully-keyed children array is committed again with one key removed and a new key inserted
- **THEN** the removed key's element is removed, a fresh element is built for the new key, and every other key's element is unaffected

#### Scenario: A children array transitioning from unkeyed to keyed leaks no elements

- **WHEN** a children array with no keys is committed again as a fully-keyed array covering the same number of positions
- **THEN** every prior unkeyed element is removed and a fresh element is built for each new key, with no stale element left behind

#### Scenario: An unkeyed list is unaffected

- **WHEN** a children array with no `key` on any child is committed again in a different order
- **THEN** reconciliation proceeds by position exactly as before this requirement, with no keyed-reconciliation behavior applied

#### Scenario: A duplicate key in the new array drops no child

- **WHEN** a fully-keyed children array is committed where two entries share the same key
- **THEN** every entry still renders as some element (none is silently dropped), even though which entry reuses the previously-matching old element is unspecified

### Requirement: Native input snapshot boundary

Native DOM input and events observed by the adapter MUST be captured through a native listener the adapter attaches to its per-root container and converted to immutable snapshots at the adapter boundary, satisfying the port's interaction-registration operation. The adapter MUST NOT require application code to attach an external listener to a queried surface element. Live DOM nodes, native event objects, and renderer-native reactive values MUST NOT cross into the runtime; only immutable snapshot data does.

#### Scenario: Native event becomes an immutable snapshot

- **WHEN** an interaction occurs on an element inside a root's container for which core registered interaction interest
- **THEN** the container's listener produces an immutable snapshot, invokes the registered delivery callback, and never passes the live DOM node or native event object into the runtime

#### Scenario: No external listener required

- **WHEN** core registers interaction interest on a mounted root through the port
- **THEN** the adapter wires capture through its own container listener, without the application selecting the surface element or attaching a listener itself

### Requirement: State-bound value crosses as a live DOM property

The adapter SHALL apply a `value` attribute on an `input`, `textarea`, or
`select` element as a live DOM property assignment rather than
`setAttribute`, on both initial mount and every later commit. The adapter
MUST NOT apply this treatment to any other element kind, since a non-form
element's `value` property (for example `<li>`, `<meter>`, or `<progress>`)
may be a numeric WebIDL type that silently coerces a string rather than
storing it. The adapter SHALL compare the incoming value against the
element's current `.value` property and SHALL skip the assignment when they
are already equal. When an assignment is necessary, the adapter SHALL
preserve the element's current text selection (`selectionStart`,
`selectionEnd`, `selectionDirection`) across the assignment when the
element supports text selection, clamping the restored range to the new
value's length. A later commit that removes the `value` attribute SHALL
clear the property through the same guarded path rather than calling
`removeAttribute`.

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

#### Scenario: A non-form element's value attribute is unaffected

- **WHEN** a primitive element whose kind is not `input`, `textarea`, or
  `select` carries a `value` attribute
- **THEN** the adapter applies it through `setAttribute` exactly as before
  this change, with no property assignment

### Requirement: Semantic event emission from interaction

The adapter SHALL report a captured interaction to the runtime through the port's interaction-registration delivery callback, and the runtime's interaction-binding contract SHALL dispatch the mapped semantic event through the runtime's own event contracts. The dispatched event MUST be a framework-owned semantic event, independent of SolidJS or DOM event objects, and the adapter MUST NOT dispatch runtime events itself.

#### Scenario: Interaction emits a semantic event

- **WHEN** a mounted root whose interaction is bound receives a native interaction the adapter captures
- **THEN** the adapter delivers a snapshot through the port and the runtime dispatches the bound semantic event through its own event contracts

### Requirement: Deterministic disposal

Unmounting or releasing a root through the adapter MUST dispose every SolidJS reactive effect, DOM listener, and interaction registration the adapter created for it. After disposal no reactive effect runs, no DOM listener remains, and no delivery callback fires, and repeated disposal repeats no cleanup.

#### Scenario: Unmount leaves no effects or listeners

- **WHEN** a mounted root is unmounted
- **THEN** its SolidJS effects are disposed, its DOM listeners and interaction registrations are removed, and no further reactive updates or deliveries occur

#### Scenario: End-to-end lifecycle

- **WHEN** one component mounts, reacts to a change, has an interaction captured that emits a semantic event, and then unmounts
- **THEN** the sequence completes and leaves no reactive effect, DOM listener, or interaction registration behind

### Requirement: Browser-environment adapter tests

The adapter SHALL be verified in a package-scoped browser-like test environment. The tests MUST exercise mount, reactive update, semantic-event emission, and disposal, and MUST NOT require or alter the core package's Node-only test environment.

#### Scenario: Adapter suite runs in a browser-like environment

- **WHEN** the adapter test suite runs
- **THEN** mount, reaction, emission, and disposal are exercised against a DOM surface in the adapter's own environment while the core suite remains Node-only

### Requirement: SolidJS adapter view registry

The SolidJS adapter SHALL accept an optional view registry and consult it — for the root node and children alike — only for a **view node** (a node carrying `node: "view"`), keyed by that node's `viewId`; a primitive node (carrying `kind`) MUST NOT trigger a registry lookup and always renders via `document.createElement(kind)`, unchanged. On a hit the adapter renders the registered Solid view within the root's reactive owner (so its effects dispose on unmount), passing the view node's `props` as its props. A view node has no tag name to fall back to, so the Solid adapter MUST throw a clear error identifying the unregistered `viewId` when a view node's `viewId` is not registered (including when no registry is configured). The registry and Solid view types MUST remain in the adapter package; `@velkren/core` MUST NOT reference them.

#### Scenario: Solid adapter renders a registered view

- **WHEN** the Solid adapter is configured with a Solid view under a `viewId` and projects a view node with that `viewId` (root or child)
- **THEN** it renders the registered Solid view for that node with the node's `props` as props

#### Scenario: Solid adapter throws on an unregistered viewId

- **WHEN** a view node's `viewId` is not registered (or no registry is configured)
- **THEN** the Solid adapter throws a clear error identifying the unregistered `viewId`

#### Scenario: A primitive node never triggers a registry lookup

- **WHEN** a primitive node's `kind` string coincidentally matches a key in the configured view registry
- **THEN** the Solid adapter still renders it as a primitive DOM element, since only a view node's `viewId` is consulted

### Requirement: Solid adapter implements child mounting

The adapter SHALL implement the `RendererPort` child-mounting operation by creating a new per-root container anchored under the DOM element registered for the given anchor name, reusing the same container/identity/interaction-listener setup as a top-level root. A registered Solid view SHALL receive a second call argument alongside its props: a context object exposing `registerAnchor(name, element)`, which the adapter records against the root currently being rendered, so a later child-mounting call naming that anchor resolves to the registered element.

#### Scenario: A view registers an anchor and hosts a child

- **WHEN** a Solid view calls `registerAnchor` with a name and an element during its own render, and a caller later calls `mountChild` naming that anchor on the same root
- **THEN** the child's per-root container is created under the registered element, with its own identity attribute and native interaction listener

#### Scenario: An unmodified view is unaffected

- **WHEN** a registered Solid view never calls `registerAnchor`
- **THEN** it renders exactly as it did before this requirement, receiving only its props

### Requirement: Interaction isolation between a nested child and its parent

A container's interaction listener SHALL ignore an event whose nearest ancestor carrying the projection identity attribute is not that container itself, so an interaction inside a child root mounted via `mountChild` is not also delivered to the parent root's own listener.

#### Scenario: An interaction inside a nested child does not reach the parent's listener

- **WHEN** a child projection is mounted via `mountChild` inside a parent root's anchor, and an interaction occurs on an element inside the child's own container
- **THEN** only the child root's interaction listener processes the event; the parent root's listener, upon seeing the bubbled event, finds the child's container as the nearest identity-bearing ancestor and does not process it
