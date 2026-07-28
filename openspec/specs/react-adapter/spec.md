# react-adapter Specification

## Purpose

TBD - created by archiving change add-react-adapter. Update Purpose after archive.

## Requirements

### Requirement: Isolated React adapter package

React SHALL be adopted only inside a dedicated adapter package that implements the framework-independent `RendererPort`. `@velkren/core` MUST NOT depend on React, import DOM or React types, or import anything from the adapter package, and the adapter MUST depend on `@velkren/core` only through its public contracts.

#### Scenario: Core stays free of the adapter and React

- **WHEN** the core package is built and its test suite runs in Node.js
- **THEN** it compiles and passes without React, DOM, or the adapter, and without importing the adapter

#### Scenario: Adapter implements the port

- **WHEN** the React adapter package is loaded
- **THEN** it exposes a renderer that satisfies the `RendererPort` contract, including `registerInteraction`, and consumes `@velkren/core` only through its public API

### Requirement: Reconciler-driven mount and commit with synchronous flushing

The adapter SHALL mount a render plan onto a real DOM surface using React's reconciler through `react-dom/client`. Because React renders asynchronously while the port contract is synchronous, `createRoot` and `commit` MUST flush the render synchronously so the runtime-assigned identity attribute is present when the port's `readIdentity` and commit-repair are read. The identity attribute SHALL be anchored on the adapter-owned per-root container (`rootContainer`), not on the rendered root element: it MUST be stamped on the container at creation, repaired on the container at each commit, and read from the container. `commit` MUST re-render so the reconciler updates the surface, `removeRoot` MUST unmount, and the adapter MUST NOT derive identity or ownership from the DOM.

#### Scenario: Mount projects a plan to the DOM synchronously

- **WHEN** the runtime projects a component instance's render plan through the React adapter
- **THEN** immediately after `createRoot` returns, each root's per-root container carries its runtime-assigned identity attribute and the rendered content is mounted inside it

#### Scenario: Commit repairs identity

- **WHEN** a root's identity attribute is removed from its container and the root is committed again
- **THEN** immediately after the commit returns, the adapter has restored the runtime-assigned identity attribute on the container while updating content

### Requirement: Semantic event emission through the binding

A captured interaction SHALL be delivered through the port so the runtime's interaction-binding contract dispatches the mapped semantic event through the runtime's own event contracts. The adapter MUST NOT dispatch runtime events itself, and a delivery-time failure MUST surface through the runtime's failure channel rather than a throw out of the adapter's native capture callback.

#### Scenario: Interaction emits a semantic event

- **WHEN** a mounted React root whose interaction is bound receives an interaction the adapter captures
- **THEN** the adapter delivers a snapshot through the port and the runtime dispatches the bound semantic event through its own event contracts

#### Scenario: A delivery-time failure surfaces through the runtime channel

- **WHEN** a bound interaction is captured but its delivery fails (for example a schema-invalid projected payload)
- **THEN** the failure surfaces through the runtime's interaction failure channel and no exception escapes the adapter's native container listener

### Requirement: Deterministic disposal

Unmounting or releasing a root through the adapter MUST unmount its React root and drop every interaction registration and container listener the adapter created for it. After disposal no interaction listener remains live and no delivery callback fires, and repeated disposal repeats no cleanup.

#### Scenario: Unmount leaves no live handlers

- **WHEN** a mounted React root is unmounted
- **THEN** its React root is unmounted, its interaction registrations and container listeners are removed, and no further delivery occurs

#### Scenario: End-to-end lifecycle

- **WHEN** one component mounts, commits a new plan, has an interaction captured that emits a semantic event, and then unmounts
- **THEN** the sequence completes and leaves no live listener or interaction registration behind

#### Scenario: Repeated disposal is a no-op

- **WHEN** a root is released and then released again
- **THEN** the second release performs no further unmount or cleanup and does not error

### Requirement: Package-local test affordances

The concrete React renderer SHALL expose adapter-local test helpers, separate from the `RendererPort`, that let its validation drive and inspect it without DOM selectors leaking into core: a way to resolve a mounted root's element by its runtime-assigned identity, and a way to simulate an interaction on an identified root such that a native DOM event bubbles to the adapter's container listener, which reports it. These helpers MUST live in the adapter package only and MUST NOT appear on the core port.

#### Scenario: Validation drives the adapter through its own affordances

- **WHEN** the validation resolves an editor's element by identity and simulates its interaction
- **THEN** a native DOM event bubbles to the adapter's container listener, which reports the interaction and delivers a snapshot through the port, without core gaining any DOM-selector or simulation API

### Requirement: Cross-framework validation of renderer independence

The adapter package SHALL validate renderer independence by mounting the **shared** renderer-agnostic neutral composition (`createEditorApp` from `@velkren/neutral-composition-fixture`) with the React renderer injected, rather than a parallel React-specific copy. Two editors MUST coexist with distinct identities, each editor's interaction MUST emit its business semantic event through the interaction-binding contract, and destroying one editor MUST release only its owned roots and registrations while the other remains functional — the same guarantees the SolidJS injection satisfies, proving the identical composition is renderer-independent.

#### Scenario: Core semantics hold on React through the shared composition

- **WHEN** the shared neutral composition is mounted with the React renderer injected, exercised, and one editor is destroyed
- **THEN** identity isolation, business-event emission through the binding, and scoped disposal all hold, with the surviving editor still emitting its event — with no React-specific copy of the composition

### Requirement: Browser-environment adapter tests

The adapter SHALL be verified in a package-scoped browser-like test environment. The tests MUST exercise mount, reconciler commit, interaction registration, semantic-event emission through the binding, and disposal, MUST render deterministically at the port boundary (synchronous flush), and MUST NOT require or alter the core package's Node-only test environment.

#### Scenario: Adapter suite runs in a browser-like environment

- **WHEN** the React adapter test suite runs
- **THEN** mount, commit, interaction registration, emission, and disposal are exercised against a DOM surface in the adapter's own environment while the core suite remains Node-only

### Requirement: Container-anchored interaction capture

The React adapter SHALL capture interactions with a native listener it attaches to the adapter-owned per-root container, not with synthetic handler props on the rendered element. `registerInteraction` SHALL record the registered interest per interaction type without requiring a re-render and MUST work whether it happens before or after mount, and the container's native listener SHALL, on a matching bubbled DOM event, produce an immutable snapshot and invoke the delivery callback. The live DOM node, native event object, and React internals MUST NOT cross into the runtime. `removeRoot` MUST remove the container's listeners so disposal leaves nothing behind.

#### Scenario: Interaction on content bubbles to the container listener

- **WHEN** core registers interaction interest on a mounted React root and an interaction occurs on an element inside the root's container
- **THEN** the DOM event bubbles to the container's native listener, which produces an immutable snapshot and invokes the delivery callback, without the application attaching any listener

#### Scenario: Registration needs no re-render

- **WHEN** an interaction is registered on an already-mounted React root
- **THEN** the registration takes effect for subsequent interactions without forcing a re-render

#### Scenario: Disposal removes the container listeners

- **WHEN** a mounted React root is removed
- **THEN** the adapter removes the container's native listeners and no further delivery occurs

### Requirement: Controlled-value elements are never React-controlled

The adapter SHALL exclude a `value` attribute from the React props of an
`input`, `textarea`, or `select` primitive element, so React's own
controlled-input tracking never installs on that DOM node. The adapter
SHALL instead apply `value` to the rendered DOM node imperatively — via a
callback ref attached to that element, invoked whenever React (re)commits
it — comparing against the element's current `.value` property and
skipping the assignment when already equal, and preserving text selection
across a necessary assignment the same way the SolidJS adapter does. A
registered view is never targeted by this mechanism: the ref is only ever
attached to a primitive `input`/`textarea`/`select` element the adapter
itself creates, never to a view's own output.

#### Scenario: A controlled-value element stays editable

- **WHEN** a primitive `input` node carries a `value` attribute and mounts
  through the React adapter
- **THEN** the rendered `<input>` receives no `value` prop from React, its
  DOM `value` property is set imperatively via a ref callback, and typing
  into it is not immediately overwritten on the next render

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

### Requirement: React adapter view registry

The React adapter SHALL accept an optional view registry and consult it in its `renderNode` path — for the root node and children alike — only for a **view node** (a node carrying `node: "view"`), keyed by that node's `viewId`; a primitive node (carrying `kind`) MUST NOT trigger a registry lookup and always renders via `createElement(kind)`, unchanged. On a hit the adapter renders the registered React component, passing the view node's `props` as its props. A view node has no tag name to fall back to, so the React adapter MUST throw a clear error identifying the unregistered `viewId` when a view node's `viewId` is not registered (including when no registry is configured). The registry and React view types MUST remain in the adapter package; `@velkren/core` MUST NOT reference them.

#### Scenario: React adapter renders a registered view

- **WHEN** the React adapter is configured with a React component under a `viewId` and projects a view node with that `viewId` (root or child)
- **THEN** it renders the registered React component for that node with the node's `props` as props

#### Scenario: React adapter throws on an unregistered viewId

- **WHEN** a view node's `viewId` is not registered (or no registry is configured)
- **THEN** the React adapter throws a clear error identifying the unregistered `viewId`

#### Scenario: A primitive node never triggers a registry lookup

- **WHEN** a primitive node's `kind` string coincidentally matches a key in the configured view registry
- **THEN** the React adapter still renders it as a primitive DOM element, since only a view node's `viewId` is consulted

### Requirement: React adapter implements child mounting

The adapter SHALL implement the `RendererPort` child-mounting operation by creating a new per-root container anchored under the DOM element registered for the given anchor name, reusing the same container/identity/interaction-listener setup as a top-level root. The adapter SHALL expose a `registerAnchor(name, element)` function to a registered view through React context (`RegisterAnchorContext`), not through the view's props, so that `ReactView`'s prop type remains exactly `FunctionComponent<JsonObject>`, unchanged from before this requirement. Calling `registerAnchor` records the element against the root currently being rendered, so a later child-mounting call naming that anchor resolves to the registered element.

#### Scenario: A view registers an anchor and hosts a child

- **WHEN** a React view reads `registerAnchor` via `useContext(RegisterAnchorContext)` and calls it with a name and an element (typically from a `ref` callback, since a real DOM element only exists at commit), and a caller later calls `mountChild` naming that anchor on the same root
- **THEN** the child's per-root container is created under the registered element, with its own identity attribute and native interaction listener, as an independent React root rather than a portal into the parent's own tree

#### Scenario: An unmodified view is unaffected

- **WHEN** a registered React view never reads `RegisterAnchorContext`
- **THEN** it renders exactly as it did before this requirement, receiving only its attribute-derived props, and its declared prop type is unaffected by this requirement

### Requirement: Interaction isolation between a nested child and its parent

A container's interaction listener SHALL ignore an event whose nearest ancestor carrying the projection identity attribute is not that container itself, so an interaction inside a child root mounted via `mountChild` is not also delivered to the parent root's own listener.

#### Scenario: An interaction inside a nested child does not reach the parent's listener

- **WHEN** a child projection is mounted via `mountChild` inside a parent root's anchor, and an interaction occurs on an element inside the child's own container
- **THEN** only the child root's interaction listener processes the event; the parent root's listener, upon seeing the bubbled event, finds the child's container as the nearest identity-bearing ancestor and does not process it
