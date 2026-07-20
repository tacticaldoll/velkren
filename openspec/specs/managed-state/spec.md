# managed-state Specification

## Purpose

Define a per-runtime managed-state domain: owner-validated, observable cells holding a frozen strict-JSON value, updated only through an explicit owned handle, with core-owned synchronous change notification and deterministic release. It is the authoritative state a listener mutates and a binding reacts to, exposing no renderer-native or reactive-library type in its contract.

## Requirements

### Requirement: Owner-validated managed state domain

The system SHALL provide a per-runtime state domain created with `createStateRuntime(runtime)`, and a second state domain on the same runtime SHALL be rejected. The domain's `create(initial)` SHALL mint a `StateHandle` that is a runtime-owned managed instance with an explicit, observable, idempotent lifecycle (`status`, `tombstone`, `assertActive`, `release`). A `StateHandle` MUST be owned by the runtime that created it, so another domain MAY validate ownership before operating on it, and a foreign-runtime handle MUST be rejected with an ownership error.

#### Scenario: One state domain per runtime

- **WHEN** `createStateRuntime` is called twice on the same runtime
- **THEN** the second call fails with a duplicate-domain error

#### Scenario: A created handle is a runtime-owned managed instance

- **WHEN** a state handle is created through the domain
- **THEN** it is owned by that runtime, reports an active status, and its release is available as a managed lifecycle operation

### Requirement: Frozen strict-JSON state value

A state handle SHALL hold a deeply frozen strict-JSON value. `create(initial)` and every `update` SHALL normalize the value to frozen strict JSON, and `read()` SHALL return that frozen value. A value that is not strict JSON (a function, a class instance, a cycle, a non-JSON primitive) MUST be rejected with a state-value error, leaving the previously stored value unchanged and notifying no observer.

#### Scenario: Read returns the frozen current value

- **WHEN** a handle is created with a strict-JSON initial value and read
- **THEN** the returned value equals the initial value and is deeply frozen

#### Scenario: A non-JSON update is rejected without effect

- **WHEN** `update` is called with a value that is not strict JSON
- **THEN** it fails with a state-value error, the stored value is unchanged, and no observer is notified

### Requirement: Explicit update with synchronous observer notification

A state handle SHALL be updated only through an explicit `update(next)`, where `next` is a new value or a function receiving the current frozen value and returning the next value. `update` SHALL store the new frozen value as the authoritative value before notifying observers, then notify every registered observer synchronously, in registration order, with the new value. Change notification MUST be a runtime-owned mechanism that exposes no renderer-native or reactive-library type in its contract.

#### Scenario: Update stores the new value and notifies observers

- **WHEN** a handle with a registered observer is updated to a new value
- **THEN** `read()` returns the new value and the observer is invoked synchronously with the new value

#### Scenario: Updater function receives the current value

- **WHEN** `update` is called with a function
- **THEN** the function receives the current frozen value and its return value becomes the new stored value

### Requirement: Observation subscription and removal

A state handle's `observe(observer)` SHALL register an observer for subsequent updates and return a subscription whose `remove()` stops further notifications to that observer without affecting others. Registering or removing an observer MUST NOT notify it of the current value by itself; observers are notified on updates only.

#### Scenario: A removed observer stops receiving updates

- **WHEN** an observer's subscription is removed and the handle is then updated
- **THEN** the removed observer is not invoked while other observers still are

### Requirement: Deterministic release and failure handling

Releasing a state handle SHALL clear its observers, drop its held value, and make later `read`, `update`, and `observe` fail as active-only; repeated release MUST repeat no cleanup. A throwing observer MUST NOT corrupt the stored value or prevent the remaining observers from being notified: `update` SHALL notify every observer and, if any threw, surface the collected failures rather than silently swallowing them.

#### Scenario: Operations fail after release

- **WHEN** a handle is released and then read, updated, or observed
- **THEN** each operation fails as active-only, and a second release performs no further cleanup

#### Scenario: A throwing observer does not corrupt state or silence others

- **WHEN** one of several observers throws during an update
- **THEN** the new value is stored, every other observer is still notified, and the failure is surfaced rather than swallowed
