## 1. Plugin Definitions and Staging

- [ ] 1.1 Add plugin identity allocation, closed PluginLifecyclePhase values, strict-JSON lifecycle record types, staging limits, and plugin-domain errors.
- [ ] 1.2 Implement helper-proven immutable PluginClass definitions with one awaited contribution callback and portable `plugin/<slug>` identity.
- [ ] 1.3 Implement a frozen closed staging builder for event definitions, listener definitions, and installation-owned bindings with post-settlement invalidation.
- [ ] 1.4 Add tests for definition provenance, mutation resistance, async contribution, builder retention, duplicate descriptors, forged definitions, bound enforcement, and zero live registry mutation during staging.

## 2. Domain Transaction Ports

- [ ] 2.1 Add internal event, listener, and endpoint transaction adapters for identity reservation, unpublished resource preparation, synchronous batch publication/withdrawal, dependency-admission leases, exact finalization, and listener binding without public generic controls.
- [ ] 2.2 Implement complete staged-graph validation for existing conflicts, EventClass availability, same-runtime endpoint authority, contributed-listener binding ownership, and deterministic descriptor order.
- [ ] 2.3 Implement hidden preparation, one synchronous cross-registry and endpoint-membership commit barrier, and reverse compensating rollback with primary and ordered cleanup failure preservation.
- [ ] 2.4 Add tests for conflict preflight, reusable definitions, runtime isolation, deterministic preparation order, concurrent observation proving no partial registration or binding state, mid-commit failure, activation failure, and complete reverse rollback attempts.

## 3. Managed Installation

- [ ] 3.1 Implement PluginInstallation internal allocation, duplicate-active PluginClass exclusion, hidden installing state, runtime ownership, and publication only after successful activation.
- [ ] 3.2 Create installation-owned ListenerInstances in binding order with immediate authority revalidation and retain their exact registrations and endpoints only while active.
- [ ] 3.3 Implement installed lifecycle observation rollback, scalar immutable records, live-reference clearing, tombstone retention, and reinstall after complete release.
- [ ] 3.4 Add tests for successful empty and populated installation, duplicate installation before callback execution, monotonic attempt identity, binding order, endpoint release race, observer cancellation attempts/failure, retained-reference clearing, and foreign runtime rejection.

## 4. Protected Uninstall and Cascade

- [ ] 4.1 Implement reversible dependency-admission leases and non-destructive preflight across every contributed listener and event registration with class ID and dependent count diagnostics.
- [ ] 4.2 Implement a per-installation operation gate plus protected uninstall with same-mode promise deduplication, conflicting-mode rejection, synchronous full-set withdrawal before awaited reverse listener-then-event finalization, deterministic lifecycle observation, aggregate cleanup errors, and idempotent terminal behavior.
- [ ] 4.3 Implement explicit cascade that releases only installation-owned listeners in reverse binding order, collects all owned cleanup failures, repeats preflight, and preserves external dependents.
- [ ] 4.4 Add tests for successful protected uninstall, lease release on rejection, dependent-retention races, owned and external dependent rejection without mutation, cascade success, owned cleanup failure, remaining external dependency, observer failure, concurrent/repeated uninstall, and no foreign disposal authority.

## 5. Public Facade and Verification

- [ ] 5.1 Compose one plugin domain into EventRuntime and add definePlugin, installPlugin, uninstallPlugin, and cascadeUninstallPlugin frozen public delegates without changing no-plugin event/listener behavior.
- [ ] 5.2 Add intentional public exports for PluginClass, contribution builder, PluginInstallation, lifecycle records, and plugin errors while proving staging storage, transaction ports, generic registries, and deferred package/component/browser APIs remain unavailable.
- [ ] 5.3 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, `openspec validate --all`, and offline dependency audit; resolve every failure.
- [ ] 5.4 Perform adversarial review against project invariants, living and delta specs, partial publication, builder escape, callback retention, ownership forgery, endpoint races, rollback failure, dependency preflight mutation, cascade overreach, public exports, Node.js isolation, and deferred scope before sync and archive.
