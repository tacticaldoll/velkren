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

The adapter SHALL mount a render plan onto a real DOM surface using React's reconciler through `react-dom/client`. Because React renders asynchronously while the port contract is synchronous, `createRoot` and `commit` MUST flush the render synchronously so the runtime-assigned identity attribute is present on the DOM when the port's `readIdentity` and commit-repair are read. `commit` MUST re-render so the reconciler updates the surface, `removeRoot` MUST unmount, and the adapter MUST apply and repair the permanent identity attribute without deriving identity or ownership from the DOM.

#### Scenario: Mount projects a plan to the DOM synchronously

- **WHEN** the runtime projects a component instance's render plan through the React adapter
- **THEN** immediately after `createRoot` returns, each root is present on the DOM surface carrying its runtime-assigned identity attribute

#### Scenario: Commit repairs identity

- **WHEN** a root's identity attribute is removed from the DOM and the root is committed again
- **THEN** immediately after the commit returns, the adapter has restored the runtime-assigned identity attribute while updating content

### Requirement: Declarative interaction registration woven into render

The adapter SHALL implement `registerInteraction` by recording the registered interest in a mutable per-root store that its rendered event handlers read at event time, rather than by attaching a listener to the managed tree from outside. Registration MUST NOT require re-rendering and MUST work whether it happens before or after mount. The adapter SHALL map the interaction-type string to the corresponding React synthetic-event handler for DOM-event-named types. When React reports a matching interaction the adapter SHALL produce an immutable snapshot and invoke the delivery callback; the live DOM node, synthetic event object, and React internals MUST NOT cross into the runtime.

#### Scenario: Interest is woven into React's own event system

- **WHEN** core registers interaction interest on a mounted React root and React later reports that interaction
- **THEN** the adapter's rendered handler reads the registered delivery callback and invokes it with an immutable snapshot, without the application attaching an external listener

#### Scenario: Registration needs no re-render

- **WHEN** an interaction is registered on an already-mounted React root
- **THEN** the registration takes effect for subsequent interactions without forcing a re-render, and reporting the interaction invokes the delivery callback

### Requirement: Semantic event emission through the binding

A captured interaction SHALL be delivered through the port so the runtime's interaction-binding contract dispatches the mapped semantic event through the runtime's own event contracts. The adapter MUST NOT dispatch runtime events itself, and a delivery-time failure MUST surface through the runtime's failure channel rather than a throw out of the synthetic-event handler.

#### Scenario: Interaction emits a semantic event

- **WHEN** a mounted React root whose interaction is bound receives an interaction the adapter captures
- **THEN** the adapter delivers a snapshot through the port and the runtime dispatches the bound semantic event through its own event contracts

#### Scenario: A delivery-time failure surfaces through the runtime channel

- **WHEN** a bound interaction is captured but its delivery fails (for example a schema-invalid projected payload)
- **THEN** the failure surfaces through the runtime's interaction failure channel and no exception escapes the React synthetic-event handler

### Requirement: Deterministic disposal

Unmounting or releasing a root through the adapter MUST unmount its React root and drop every interaction registration the adapter created for it. After disposal no rendered handler remains live and no delivery callback fires, and repeated disposal repeats no cleanup.

#### Scenario: Unmount leaves no live handlers

- **WHEN** a mounted React root is unmounted
- **THEN** its React root is unmounted, its interaction registrations are dropped, and no further delivery occurs

#### Scenario: End-to-end lifecycle

- **WHEN** one component mounts, commits a new plan, has an interaction captured that emits a semantic event, and then unmounts
- **THEN** the sequence completes and leaves no live handler or interaction registration behind

#### Scenario: Repeated disposal is a no-op

- **WHEN** a root is released and then released again
- **THEN** the second release performs no further unmount or cleanup and does not error

### Requirement: Package-local test affordances

The concrete React renderer SHALL expose adapter-local test helpers, separate from the `RendererPort`, that let its validation drive and inspect it without DOM selectors leaking into core: a way to resolve a mounted root's element by its runtime-assigned identity, and a way to simulate an interaction on an identified root such that React's own event system reports it. These helpers MUST live in the adapter package only and MUST NOT appear on the core port.

#### Scenario: Validation drives the adapter through its own affordances

- **WHEN** the validation resolves an editor's element by identity and simulates its interaction
- **THEN** React's event system reports the interaction to the adapter, which delivers a snapshot through the port, without core gaining any DOM-selector or simulation API

### Requirement: Cross-framework validation of renderer independence

The adapter package SHALL validate renderer independence by mounting the **shared** renderer-agnostic two-editor composition (`createEditorApp` from `@velkren/two-editor-validation`) with the React renderer injected, rather than a parallel React-specific copy. Two editors MUST coexist with distinct identities, each editor's interaction MUST emit its business semantic event through the interaction-binding contract, and destroying one editor MUST release only its owned roots and registrations while the other remains functional — the same guarantees the SolidJS injection satisfies, proving the identical composition is renderer-independent.

#### Scenario: Core semantics hold on React through the shared composition

- **WHEN** the shared two-editor composition is mounted with the React renderer injected, exercised, and one editor is destroyed
- **THEN** identity isolation, business-event emission through the binding, and scoped disposal all hold, with the surviving editor still emitting its event — with no React-specific copy of the composition

### Requirement: Browser-environment adapter tests

The adapter SHALL be verified in a package-scoped browser-like test environment. The tests MUST exercise mount, reconciler commit, declarative interaction registration, semantic-event emission through the binding, and disposal, MUST render deterministically at the port boundary (synchronous flush), and MUST NOT require or alter the core package's Node-only test environment.

#### Scenario: Adapter suite runs in a browser-like environment

- **WHEN** the React adapter test suite runs
- **THEN** mount, commit, interaction registration, emission, and disposal are exercised against a DOM surface in the adapter's own environment while the core suite remains Node-only
