# Plugin Transactions

## Purpose

Define portable plugin contributions and runtime-isolated transactional installation, lifecycle, rollback, and protected removal semantics.

## Requirements

### Requirement: Immutable PluginClass definitions

The system SHALL expose helper-proven immutable PluginClass definitions with canonical `plugin/<slug>` IDs and exactly one awaited contribution callback. Definitions SHALL be reusable across runtimes, while active installations and all contributed resources remain runtime-owned and isolated.

#### Scenario: Define and reuse a plugin

- **WHEN** one PluginClass is installed into two different runtimes
- **THEN** both runtimes use the same immutable definition but receive independent installation identities, registrations, subscriptions, and lifecycle

#### Scenario: Reject forged plugin definition

- **WHEN** installation receives a structural imitation or mutable PluginClass
- **THEN** it fails before contribution execution, staging, or registry mutation

### Requirement: Closed bounded contribution staging

The plugin contribution callback SHALL receive one frozen staging builder limited to adding helper-proven EventClass definitions, helper-proven ListenerClass definitions, and listener bindings owned by that installation. Staging MUST NOT mutate live registries. The system MUST materialize contributions once, enforce explicit count bounds, reject duplicate identities and bindings, and invalidate the builder when the callback settles.

#### Scenario: Stage valid contributions

- **WHEN** a contribution callback adds valid event, listener, and binding descriptors
- **THEN** the descriptors remain private and no registration or listener becomes observable before transaction commit

#### Scenario: Retain staging builder

- **WHEN** a callback invokes its builder after the callback has settled
- **THEN** the operation fails explicitly without changing the staged transaction or live runtime

#### Scenario: Invalid staged graph

- **WHEN** staging includes a forged definition, duplicate class ID, duplicate binding, foreign endpoint, unavailable EventClass, or exceeds a bound
- **THEN** installation rejects before any registry mutation or listener callback execution

### Requirement: Atomic multi-registry installation

Installation SHALL validate the complete staged graph and prepare event registrations, listener registrations, and installation-owned ListenerInstances outside live registry and endpoint membership. It MUST publish every prepared registration and binding within one synchronous commit barrier without a user callback or promise boundary, then publish one active PluginInstallation only after installed lifecycle observation succeeds. Existing registration conflicts MUST reject without replacing active definitions.

Any failure before publication MUST release created listeners, unregister committed listener registrations, and unregister committed event registrations in reverse order. Cleanup MUST continue after individual failures, and one PluginInstallationError MUST preserve the primary cause and every ordered rollback failure.

#### Scenario: Successful installation

- **WHEN** every staged contribution validates, commits, binds, and observes successfully
- **THEN** one active runtime-owned PluginInstallation exposes immutable diagnostic identity while all contributions become observable together

#### Scenario: Registration conflict

- **WHEN** any staged class conflicts with an active registration
- **THEN** installation fails before commit and preserves every existing registration unchanged

#### Scenario: Activation failure

- **WHEN** listener binding or installed lifecycle observation fails after registrations commit
- **THEN** installation rejects only after all created listeners and committed registrations receive reverse-order rollback attempts

#### Scenario: Concurrent observation during installation

- **WHEN** asynchronous preparation or lifecycle work yields while another operation resolves registrations or publishes through an affected endpoint
- **THEN** that operation observes either the complete prior graph or the complete committed contribution graph and never a partial registration or binding subset

### Requirement: Managed PluginInstallation ownership

Each PluginInstallation SHALL have a runtime-qualified identity, PluginClass identity, opaque runtime ownership, observable managed status, and active-only internal references to its contributed registrations, binding authorities, and owned ListenerInstances. A runtime MUST reject a second active installation of the same PluginClass before contribution execution. Complete release MUST clear live definitions, callbacks, endpoints, registrations, and listener references while retaining only diagnostic tombstone data.

#### Scenario: Reject duplicate active installation

- **WHEN** the same runtime already has an active installation for a PluginClass
- **THEN** a second install attempt fails before invoking its contribution callback

#### Scenario: Reinstall after release

- **WHEN** a prior installation has completely released and no conflicting contribution remains
- **THEN** the runtime may install the same PluginClass again with a new monotonic installation identity

#### Scenario: Reject foreign installation

- **WHEN** uninstall receives a PluginInstallation owned by another runtime
- **THEN** it fails before dependency inspection, listener release, or registry mutation

### Requirement: Protected non-destructive uninstall

Protected uninstall SHALL acquire reversible dependency-admission leases on every contributed listener and event registration before preflight. While leased, new dependent retention MUST fail or wait without mutation. If any registration has a live dependent, the operation MUST release all leases and fail with class identity and dependent count information while leaving installation status, owned listeners, and all registrations unchanged. If preflight succeeds, the system MUST synchronously withdraw every contributed registration from new resolution and retention before awaiting reverse listener-then-event cleanup and installation release.

#### Scenario: Uninstall without dependents

- **WHEN** an active installation has no live registration dependents
- **THEN** all contributions unregister in deterministic reverse order and the installation releases

#### Scenario: Reject protected uninstall with dependents

- **WHEN** any contributed registration has an active dependent
- **THEN** uninstall fails before releasing an owned listener or unregistering any contribution

#### Scenario: Dependent races uninstall

- **WHEN** another operation attempts to retain a contributed registration after uninstall acquires its admission leases
- **THEN** no new dependent is admitted between preflight and synchronous withdrawal, and uninstall cannot remove a registration using stale dependency information

#### Scenario: Concurrent uninstall operations

- **WHEN** repeated protected uninstall calls overlap
- **THEN** they share one operation result, while a conflicting cascade call fails before changing cleanup authority; dependency rejection returns the installation to active operation state

### Requirement: Explicit installation-owned cascade

Cascade uninstall SHALL acquire the same reversible admission leases, release only ListenerInstances created and tracked by the selected installation in reverse binding order, then repeat complete registration dependency preflight while admission remains closed. It MUST NOT release or mutate external dependents. If external dependents remain, contribution withdrawal MUST NOT begin and every lease MUST be released. Owned-listener release failures SHALL be collected and reported after every owned listener receives a release attempt.

#### Scenario: Cascade owned bindings

- **WHEN** contributed listener registrations are retained only by installation-owned bindings
- **THEN** cascade releases those bindings in reverse order and then uninstalls all contributions

#### Scenario: Preserve external dependents

- **WHEN** post-cascade preflight finds a dependent not released by installation ownership
- **THEN** cascade reports the remaining dependency and leaves every contributed registration installed

#### Scenario: Owned cleanup failure

- **WHEN** one owned listener release fails
- **THEN** every remaining owned listener still receives a release attempt and registration removal does not begin

### Requirement: Observable non-cancellable plugin lifecycle

The plugin domain SHALL define a closed PluginLifecyclePhase enum and emit deeply frozen strict-JSON scalar records for installed, uninstalling, released, and rollback phases. An optional asynchronous observer SHALL be awaited in sequence, and observer return values MUST NOT cancel or mutate lifecycle work. Observer failure during installation MUST trigger rollback; observer failure during uninstall MUST be aggregated after required cleanup continues.

#### Scenario: Observe successful lifecycle

- **WHEN** a plugin installs and later uninstalls
- **THEN** the observer receives ordered immutable records without PluginClass, registration, endpoint, ListenerInstance, callback, or Error references

#### Scenario: Observer attempts cancellation

- **WHEN** an observer returns false or another value
- **THEN** the framework ignores the value and continues the lifecycle operation

#### Scenario: Observer failure during installation

- **WHEN** installed observation throws or rejects
- **THEN** installation rejects only after rollback and reports observer and rollback failures explicitly

### Requirement: Public plugin-domain boundary

The public core entry SHALL expose PluginClass, PluginInstallation, contribution builder, lifecycle record, installation, uninstall, cascade, and plugin-domain error contracts without exposing generic registries, staging storage, transaction commit ports, dependent mutation, or deferred package/component/browser APIs.

#### Scenario: Import plugin APIs

- **WHEN** a consumer imports `@velkren/core` through its public export map
- **THEN** plugin contracts are available while generic transaction kernels and deferred domains remain unavailable

### Requirement: Framework-independent plugin core

Plugin definitions, staging, transactions, lifecycle, rollback, and uninstall SHALL remain usable in Node.js without DOM, JSX, CSS, renderer, browser Event, package-manager, or reactive-library dependencies.

#### Scenario: Execute plugin core in Node.js

- **WHEN** the plugin transaction test suite runs in a Node.js environment
- **THEN** installation, conflicts, rollback, protected uninstall, cascade, lifecycle, ownership rejection, and cleanup complete without browser globals
