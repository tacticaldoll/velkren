# Layout Coordination

## Purpose

Define a runtime-owned, handle-only layout coordinator: registration of synchronous layout contracts for owner-validated RootHandles, explicit invalidation, and a deterministic synchronous measure/calculate/apply pass that stays independent of renderer projection and the DOM.

## Requirements

### Requirement: Handle-only layout registration

The layout coordinator SHALL register a layout contract for an owner-validated RootHandle only. It MUST reject a foreign-runtime handle, a released handle, a structural imitation, and any non-handle value such as a DOM node, element, string, or selector, before recording a binding. At most one active layout contract SHALL exist per RootHandle.

#### Scenario: Register a layout contract

- **WHEN** a layout contract is registered for an active owner-validated RootHandle
- **THEN** the handle gains one active layout binding

#### Scenario: Reject a foreign or non-handle target

- **WHEN** registration receives a handle owned by another runtime or a non-handle value such as a string or selector
- **THEN** it fails before recording a binding

#### Scenario: Reject a duplicate layout contract

- **WHEN** a second layout contract is registered for a handle that already has one
- **THEN** registration fails and the existing binding is unchanged

### Requirement: Deterministic three-phase layout pass

A layout pass SHALL run three ordered phases — measure, then calculate, then apply — completing every invalidated handle's phase before the next phase begins. Handles SHALL be processed in deterministic registration order within each phase, and a per-handle scratch SHALL carry values from measure through calculate to apply.

#### Scenario: Phases run in order across handles

- **WHEN** two invalidated handles each define measure, calculate, and apply hooks and a pass runs
- **THEN** both measure hooks run before any calculate hook, both calculate hooks run before any apply hook, and each phase visits handles in registration order

#### Scenario: Scratch carries across phases

- **WHEN** a handle's measure hook records a value in its scratch
- **THEN** its calculate and apply hooks observe that value within the same pass

### Requirement: Invalidation drives layout passes

Invalidation SHALL mark a registered handle dirty. A layout pass SHALL process only currently dirty handles and MUST clear their dirty state when the pass completes. A handle that was not invalidated MUST NOT be processed, and invalidating an unregistered or released handle MUST fail explicitly.

#### Scenario: Only invalidated handles are processed

- **WHEN** one of two registered handles is invalidated and a pass runs
- **THEN** only the invalidated handle's phases run and its dirty state is cleared afterward

#### Scenario: Reject invalidating an unregistered handle

- **WHEN** invalidation receives a handle with no active layout binding
- **THEN** it fails explicitly without scheduling a pass

### Requirement: Synchronous-only phase hooks

Every layout phase hook MUST run synchronously. A hook that returns a promise or any thenable MUST fail the pass explicitly, and no later phase MUST run for that handle after such a failure.

#### Scenario: Reject an asynchronous phase hook

- **WHEN** a measure, calculate, or apply hook returns a promise or thenable during a pass
- **THEN** the pass fails explicitly identifying the phase and the offending handle

#### Scenario: Synchronous hooks complete a pass

- **WHEN** every phase hook returns synchronously
- **THEN** the pass completes and all invalidated handles advance through measure, calculate, and apply

### Requirement: Independence from renderer projection

Layout bindings MUST reference only RootHandles and MUST NOT depend on renderer projection internals, DOM nodes, or the projected surface. Releasing a RootHandle MUST drop its layout binding so a released handle is neither processed nor requires manual deregistration.

#### Scenario: Released handle drops its binding

- **WHEN** a RootHandle with an active layout binding is released and a later pass runs
- **THEN** the released handle is not processed and its binding is gone

#### Scenario: Layout uses handles without the surface

- **WHEN** a layout pass runs against registered handles
- **THEN** measure, calculate, and apply operate on handle-scoped contracts without reading the projected surface or any DOM node

### Requirement: Public layout-domain boundary

The public core entry SHALL expose the layout runtime, the layout contract and phase contracts, the layout phase enum, and layout-domain error contracts without exposing generic registries, factory kernels, projection internals, or deferred layout-strategy, scheduler, or animation APIs.

#### Scenario: Import layout APIs

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** the layout runtime and contracts are available while generic kernels and deferred domains remain unavailable

### Requirement: Framework-independent layout core

The layout runtime, contracts, phases, invalidation, and pass execution MUST remain usable in Node.js without DOM, JSX, CSS, real-renderer, browser Event, or reactive-library dependencies.

#### Scenario: Execute layout core in Node.js

- **WHEN** the layout test suite runs in a Node.js environment
- **THEN** registration, invalidation, ordered synchronous passes, async-hook rejection, ownership rejection, and released-handle cleanup all execute without browser globals
