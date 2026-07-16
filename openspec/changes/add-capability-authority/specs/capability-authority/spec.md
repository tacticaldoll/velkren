## ADDED Requirements

### Requirement: Capability authority domain

The system SHALL expose a `CapabilityRuntime` domain composed onto one `Runtime`, created with an explicit `AuthorityPolicy` or a default permissive policy. At most one capability domain SHALL exist per runtime, and a second creation MUST fail explicitly without replacing the first. Chain storage, the audit log, and the sequence counter MUST remain internal; the public facade SHALL expose only owner-validated `Capability` handles and an immutable audit transcript. Generic authority kernels MUST remain unavailable through the public export map.

#### Scenario: Create the capability domain

- **WHEN** a caller creates a capability domain for a runtime with or without a policy
- **THEN** the domain is composed onto that runtime and mints capabilities only through its owner-validated facade

#### Scenario: Reject a second domain

- **WHEN** a caller creates a second capability domain for a runtime that already has one
- **THEN** creation fails explicitly and the existing domain, its chain, and its audit log are unchanged

#### Scenario: Kernels remain internal

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** capability creation, `Capability`, `AuthorityPolicy`, and audit transcript contracts are available without chain storage, audit storage, or generic authority kernels

### Requirement: Capabilities minted from owner-held references

The system SHALL mint a `Capability` only from a genuine same-runtime component `Reference` held by the caller, conferring an immutable set of operations drawn from the policy's operation universe. A `Capability` SHALL be a frozen owner-validated token exposing only diagnostic identity, its operation set, its status, and authority operations. Possession of a capability MUST NOT expose the private controller, the target instance object, the underlying reference, or the chain store. Strings, structural imitations, and foreign-runtime references MUST NOT mint a capability.

#### Scenario: Mint from an owned reference

- **WHEN** a caller mints a capability from a same-runtime reference it owns for operations within the policy universe
- **THEN** the capability carries a frozen operation set and diagnostic target identity without exposing private runtime capabilities

#### Scenario: Reject forged or foreign reference

- **WHEN** minting receives a structural imitation, a string, or a reference owned by another runtime
- **THEN** minting fails with an ownership or authority error before any capability is created

#### Scenario: Reject out-of-universe operations

- **WHEN** minting requests an operation outside the policy's operation universe
- **THEN** minting fails with a policy error before any capability is created

### Requirement: Attenuation-only grant

The system SHALL derive a child capability through `grant`, whose operation set MUST be a subset of its parent's. Omitting the requested operations SHALL copy the parent's set. A grant that requests any operation outside the parent's set MUST fail with an attenuation error before a child is minted. Granting MUST NOT widen authority, and a re-grant MUST NOT overwrite, replace, or broaden an existing capability — it only produces a new equal-or-narrower one.

#### Scenario: Grant a narrower subset

- **WHEN** a holder grants a subset of its capability's operations
- **THEN** the child capability carries exactly that subset and the parent is unchanged

#### Scenario: Reject widening grant

- **WHEN** a holder grants an operation its capability does not hold
- **THEN** the grant fails with an attenuation error and no child capability is minted

#### Scenario: Re-grant does not overwrite

- **WHEN** a holder grants from the same parent twice
- **THEN** two independent child capabilities exist and neither replaces the other or the parent's authority

### Requirement: Scoped delegation over a chain

The system SHALL derive a scope-bound capability through `delegate`, recording a parent link and depth in a delegation chain, under the same subset-attenuation rule as grant. Delegation SHALL be permitted only when the policy allows it and the resulting depth does not exceed the policy maximum; a violation MUST fail with a policy error before a delegate is minted. A delegate SHALL bind its scope for audit and diagnostics only and MUST NOT consult the scope, selectors, the DOM, or any global registry for lookup. Chain lineage SHALL be inspectable without exposing mutable internals.

#### Scenario: Delegate within a scope

- **WHEN** a holder delegates a subset of its capability within a scope it owns
- **THEN** the derived capability records the parent link and scope and carries the delegated subset

#### Scenario: Reject delegation forbidden by policy

- **WHEN** a holder delegates under a policy that forbids delegation or would exceed the maximum depth
- **THEN** delegation fails with a policy error and no delegate is minted

#### Scenario: Delegate performs no implicit lookup

- **WHEN** a delegated capability is used
- **THEN** it operates only its declared target through the chain and never resolves collaborators by selector, DOM, or global registry

### Requirement: Standalone and lifecycle-coupled revocation

Revoking a capability SHALL invalidate it and all its transitive delegates immediately and idempotently, without releasing the target instance, so that no holder in the revoked chain can operate the target afterward. A revoked capability and its descendants MUST fail operation with a revocation error. Releasing the target instance SHALL revoke every capability over it through the existing reference revocation, and using a capability whose target has been released MUST fail with a lifecycle error distinct from the standalone-revocation error.

#### Scenario: Standalone transitive revocation

- **WHEN** a capability with delegated descendants is revoked
- **THEN** the capability and every transitive delegate can no longer operate the target, while the target instance remains active

#### Scenario: Idempotent revocation

- **WHEN** revoke is requested more than once for the same capability or chain
- **THEN** later requests observe the revoked state and record no new revocation

#### Scenario: Released target versus revoked authority

- **WHEN** a capability's target instance is released and, separately, a capability is revoked standalone
- **THEN** the released-target use fails with a lifecycle error and the revoked-authority use fails with a revocation error, and the two failures are distinguishable

### Requirement: Authority policy enforcement

The system SHALL evaluate the domain's `AuthorityPolicy` — operation universe, delegation permission, and maximum delegation depth — at mint, grant, and delegate time, and MUST fail before minting any capability when a request violates it. Attenuation (subset-only derivation) SHALL hold regardless of policy. A default policy SHALL allow delegation with no depth cap and infer its universe from the first mint so the terse case needs no explicit policy.

#### Scenario: Enforce operation universe

- **WHEN** any mint, grant, or delegate requests an operation outside the policy universe
- **THEN** it fails with a policy error before minting

#### Scenario: Enforce maximum delegation depth

- **WHEN** a delegation would produce a capability deeper than the policy maximum
- **THEN** it fails with a policy error and no delegate is minted

### Requirement: Attenuation-only invocation

Invoking an operation through a `Capability` MUST validate capability provenance, same-runtime ownership, a non-revoked chain, and operation membership before operating the target's public contract. An operation not in the capability's set, a foreign-runtime or imitation capability, and a revoked or released chain MUST fail explicitly without performing the operation.

#### Scenario: Invoke an authorized operation

- **WHEN** a holder invokes an operation its active capability grants on a live target
- **THEN** the operation runs against the target's public contract and returns its result

#### Scenario: Deny an unauthorized operation

- **WHEN** a holder invokes an operation its capability does not hold
- **THEN** the invocation fails with an authority error and the target is not operated

#### Scenario: Deny a foreign or imitation capability

- **WHEN** invocation receives a structural imitation or a capability owned by another runtime
- **THEN** it fails with an ownership or authority error before operating the target

### Requirement: Capability audit trail

The system SHALL record an append-only audit trail of mint, grant, delegation, revocation, and denied-invocation events, each carrying a monotonic sequence number, the action, the capability identity, the parent identity, and the operation set or denied operation. The trail SHALL be exposed as an immutable transcript ordered by sequence number and MUST NOT expose mutable internals or depend on wall-clock time, so that replaying the same operations yields the same transcript.

#### Scenario: Record authority events

- **WHEN** capabilities are minted, granted, delegated, and revoked
- **THEN** the audit transcript contains one deterministically ordered record per event with capability and parent identity

#### Scenario: Record denied invocation

- **WHEN** an invocation is denied for an unauthorized operation
- **THEN** the transcript records a denied event naming the capability and operation, and the target is not operated

### Requirement: Public capability-domain boundary

The public core entry SHALL expose capability-authority creation, `Capability` handles, `AuthorityPolicy`, the audit transcript, and capability-domain error contracts without exposing chain internals, audit storage, sequence state, or generic authority kernels.

#### Scenario: Import capability APIs

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** capability creation, handles, policy, audit, and error contracts are available while their internal chain and audit stores remain unavailable

### Requirement: Framework-independent capability core

Capability minting, grant, delegation, revocation, invocation, policy, and audit contracts MUST remain usable in Node.js without DOM, JSX, CSS, renderer, browser Event, or reactive-library dependencies.

#### Scenario: Execute capability core in Node.js

- **WHEN** the capability-domain test suite runs in a Node.js environment
- **THEN** minting, grant, delegation, revocation, invocation, policy enforcement, and audit complete without browser globals
