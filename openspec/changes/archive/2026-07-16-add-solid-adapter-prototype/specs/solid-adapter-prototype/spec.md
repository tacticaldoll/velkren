## ADDED Requirements

### Requirement: Isolated SolidJS adapter package

SolidJS SHALL be adopted only inside a dedicated adapter package that implements the framework-independent `RendererPort`. `@velkren/core` MUST NOT depend on SolidJS, import DOM or reactive types, or import anything from the adapter package, and the adapter MUST depend on `@velkren/core` only through its public contracts.

#### Scenario: Core stays free of the adapter and SolidJS

- **WHEN** the core package is built and its test suite runs in Node.js
- **THEN** it compiles and passes without SolidJS, DOM, or reactive dependencies and without importing the adapter

#### Scenario: Adapter implements the port

- **WHEN** the adapter package is loaded
- **THEN** it exposes a renderer that satisfies the `RendererPort` contract and consumes `@velkren/core` only through its public API

### Requirement: Reactive mount and commit through the port

The adapter SHALL mount a render plan onto a real DOM surface using SolidJS reactivity, driven only through the `RendererPort` operations. It MUST apply the runtime-assigned permanent identity attribute at creation and re-apply it on every commit, repairing it if the surface lost it, without deriving identity or ownership from the DOM.

#### Scenario: Mount projects a plan to the DOM

- **WHEN** the runtime projects a component instance's render plan through the adapter
- **THEN** each root is created on the DOM surface carrying its runtime-assigned identity attribute

#### Scenario: Commit repairs identity

- **WHEN** a root's identity attribute is removed from the DOM and the root is committed again
- **THEN** the adapter restores the runtime-assigned identity attribute while updating content

### Requirement: Native input snapshot boundary

Native DOM input and events observed by the adapter MUST be captured as immutable snapshots at the adapter boundary. Live DOM nodes, native event objects, and renderer-native reactive values MUST NOT cross into the runtime; only immutable snapshot data and runtime semantic events do.

#### Scenario: Native event becomes an immutable snapshot

- **WHEN** the adapter observes a native input event on a mounted root
- **THEN** it produces an immutable snapshot and never passes the live DOM node or native event object into the runtime

### Requirement: Semantic event emission from interaction

The adapter SHALL translate a native interaction into a runtime semantic event dispatched through the runtime's event contracts, not through renderer-native event propagation. The emitted event MUST be a framework-owned semantic event, independent of SolidJS or DOM event objects.

#### Scenario: Interaction emits a semantic event

- **WHEN** a mounted root receives a native interaction the adapter is configured to translate
- **THEN** the runtime observes a semantic event dispatched through its own event contracts

### Requirement: Deterministic disposal

Unmounting or releasing a root through the adapter MUST dispose every SolidJS reactive effect and DOM listener the adapter created for it. After disposal no reactive effect runs and no DOM listener remains, and repeated disposal repeats no cleanup.

#### Scenario: Unmount leaves no effects or listeners

- **WHEN** a mounted root is unmounted
- **THEN** its SolidJS effects are disposed, its DOM listeners are removed, and no further reactive updates occur

#### Scenario: End-to-end lifecycle

- **WHEN** one component mounts, reacts to a change, emits a semantic event, and then unmounts
- **THEN** the sequence completes and leaves no reactive effect or DOM listener behind

### Requirement: Browser-environment adapter tests

The adapter SHALL be verified in a package-scoped browser-like test environment. The tests MUST exercise mount, reactive update, semantic-event emission, and disposal, and MUST NOT require or alter the core package's Node-only test environment.

#### Scenario: Adapter suite runs in a browser-like environment

- **WHEN** the adapter test suite runs
- **THEN** mount, reaction, emission, and disposal are exercised against a DOM surface in the adapter's own environment while the core suite remains Node-only
