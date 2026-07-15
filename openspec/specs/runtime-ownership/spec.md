# Runtime Ownership Specification

## Purpose

Define framework-independent runtime identity, ownership isolation, managed lifecycle, and released-object diagnostics.

## Requirements

### Requirement: Runtime identity

The system SHALL assign every runtime a readable identifier and a distinct opaque ownership identity. A caller SHALL be able to provide the readable identifier or allow the runtime to generate one.

#### Scenario: Explicit runtime identifier

- **WHEN** a caller creates a runtime with a valid explicit identifier
- **THEN** the runtime exposes that identifier for qualified IDs and diagnostics

#### Scenario: Generated runtime identifier

- **WHEN** a caller creates a runtime without an identifier
- **THEN** the runtime generates a valid readable identifier

#### Scenario: Equal readable identifiers do not share ownership

- **WHEN** two runtimes are created with equal readable identifiers
- **THEN** their opaque ownership identities remain distinct

### Requirement: Runtime ownership isolation

The system MUST associate every runtime-managed object with the opaque ownership identity of the runtime that created it. A runtime MUST reject a managed object owned by another runtime before performing any mutation or lifecycle operation.

#### Scenario: Same-runtime operation

- **WHEN** a runtime receives a live managed object that it owns
- **THEN** the runtime permits the requested operation subject to the object's public contract

#### Scenario: Cross-runtime operation

- **WHEN** a runtime receives a managed object owned by another runtime
- **THEN** the runtime throws an ownership error before changing either runtime or object state

### Requirement: Managed lifecycle

Every runtime-managed object SHALL follow an observable lifecycle from creation through active use to release. Release MUST be idempotent, MUST revoke the object's active capabilities, and MUST clean registered resources in reverse registration order.

#### Scenario: Successful release

- **WHEN** a live managed object is released
- **THEN** its registered resources are cleaned in reverse order and its status becomes released

#### Scenario: Repeated release

- **WHEN** release is requested more than once for the same managed object
- **THEN** cleanup side effects occur only once and subsequent requests observe the released state

#### Scenario: Resource cleanup failure

- **WHEN** one or more registered resource cleanups fail during release
- **THEN** the system attempts every remaining cleanup in reverse order, marks the object released, and reports one managed release error containing every cleanup failure

#### Scenario: Repeated release after cleanup failure

- **WHEN** release is requested again after a cleanup failure
- **THEN** no cleanup is repeated and the same managed release failure remains observable

#### Scenario: Operation after release

- **WHEN** a caller requests a mutating operation on a released managed object
- **THEN** the system rejects the operation with a lifecycle error

### Requirement: Diagnostic tombstones

After release, a managed object SHALL retain only the minimum diagnostic identity needed to explain its origin and released state. It MUST NOT retain active resources, capabilities, or references to other managed objects.

#### Scenario: Inspect released object

- **WHEN** a released managed object is inspected
- **THEN** the inspection reports its qualified ID, class identity, released status, and release time without exposing active resources

### Requirement: Framework-independent ownership core

Runtime identity, ownership validation, managed lifecycle, and diagnostic tombstones MUST be usable in a Node.js environment without DOM, JSX, CSS, or renderer framework dependencies.

#### Scenario: Execute ownership tests in Node.js

- **WHEN** the ownership test suite runs without a browser environment
- **THEN** runtime creation, ownership rejection, release, and tombstone behavior all execute successfully
