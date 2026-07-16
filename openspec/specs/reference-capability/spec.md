# Reference Capability

## Purpose

Define a shared, owner-validated reference/capability primitive: runtime-issued handles carrying framework provenance, a public (use-only) / private (control-and-release) split, deterministic release through the managed lifecycle, and cross-runtime isolation, so domains consume one abstraction instead of re-implementing the pattern.

## Requirements

### Requirement: Runtime-issued capability with framework provenance

The runtime SHALL be the only issuer of reference/capability handles. Every issued capability SHALL carry framework provenance that is not reconstructible from ordinary values, and SHALL be associated with the issuing runtime's ownership token. A plain object, string, DOM attribute, or selector SHALL NOT be usable as a capability. Validation SHALL check runtime ownership before framework provenance, so an unowned or foreign object fails as an ownership error and a runtime-owned object that was never issued as a capability fails as a provenance error.

#### Scenario: Runtime issues a capability

- **WHEN** a caller creates a capability through the owning runtime
- **THEN** the returned handle is recognized by that runtime as owned and framework-issued

#### Scenario: Unowned object fails ownership before provenance

- **WHEN** a plain object that no runtime owns is presented where a capability is expected
- **THEN** the runtime rejects it with an ownership error and performs no operation

#### Scenario: Runtime-owned non-capability is rejected on provenance

- **WHEN** an object owned by the runtime but never issued as a capability is presented where a capability is expected
- **THEN** the runtime rejects it with a provenance error and performs no operation

### Requirement: Owner-validated resolution

A capability SHALL be resolvable only through the runtime that issued it. Resolution SHALL validate runtime ownership and framework provenance and active status before returning the underlying authority, and SHALL fail explicitly when any check does not hold.

#### Scenario: Resolution succeeds for the owning runtime

- **WHEN** the issuing runtime resolves a capability it owns
- **THEN** resolution returns the underlying authority for use

#### Scenario: Foreign runtime cannot resolve

- **WHEN** a runtime attempts to resolve a capability issued by a different runtime
- **THEN** resolution fails with an ownership error and exposes no authority

### Requirement: Public and private handle split

Issuing a capability SHALL produce a public reference and a private handle. The private handle SHALL grant control operations including release. The public reference SHALL grant use only and SHALL NOT expose release or any other private runtime capability, even to a holder that also possesses the runtime.

#### Scenario: Private handle controls the capability

- **WHEN** a holder of the private handle requests release
- **THEN** the capability is released

#### Scenario: Public reference cannot control the capability

- **WHEN** a holder of only the public reference attempts a control operation such as release
- **THEN** no control operation is available and the capability remains unaffected

#### Scenario: Public reference does not leak private authority

- **WHEN** a holder inspects a public reference
- **THEN** it obtains no handle, method, or field that grants private runtime capability

### Requirement: Readable diagnostic identity

An issued capability SHALL expose a readable diagnostic identity that supports inspection and tracing, distinct from the opaque provenance and ownership token that authorize operations. Possession of the readable identity SHALL NOT grant any operation. After release the capability SHALL retain a diagnostic tombstone consistent with the managed lifecycle.

#### Scenario: Readable identity is exposed and does not authorize

- **WHEN** a caller reads a capability's diagnostic identity
- **THEN** the identity is a readable value that grants no operation on the capability

#### Scenario: Tombstone survives release

- **WHEN** a capability is released
- **THEN** a diagnostic tombstone recording its identity and released status remains observable

### Requirement: Deterministic release through the managed lifecycle

A capability SHALL be a managed resource whose release is integrated with the runtime's managed lifecycle. Release SHALL be requestable more than once and perform its work exactly once. After a successful release, use and resolution SHALL be rejected as inactive. Release SHALL run registered cleanups without silently swallowing failures, and a release whose cleanup failed SHALL keep that failure observable on every subsequent release request.

#### Scenario: Use after release is rejected

- **WHEN** a successfully released capability is resolved or used
- **THEN** the runtime rejects the operation as inactive

#### Scenario: Successful release runs once and later requests are quiet

- **WHEN** release is requested again after a capability has already released successfully
- **THEN** no cleanup runs a second time and the later request resolves without error

#### Scenario: Failed-release failure stays observable

- **WHEN** a registered cleanup throws during release and release is requested again
- **THEN** the same release failure is reported on the later request rather than being discarded

### Requirement: Cross-runtime isolation

Capabilities issued by independent runtimes SHALL remain isolated even when they share the same canonical class identity. Possessing a capability from one runtime SHALL NOT authorize any operation on another runtime, and releasing a capability in one runtime SHALL NOT affect capabilities in another.

#### Scenario: Same-class capabilities do not cross runtimes

- **WHEN** two runtimes each issue a capability with the same canonical class identity
- **THEN** neither runtime can resolve or operate the other's capability

#### Scenario: Release in one runtime does not affect another

- **WHEN** one runtime releases its capability
- **THEN** another runtime's capability of the same canonical class identity remains active and resolvable
