## Context

Velkren currently exposes separate runtime-owned event and listener registries through `EventRuntime`. Their protected registration handles and dependency counts prevent unsafe replacement or unregistration, while batch registration is atomic only within one generic registry. A plugin must coordinate multiple registries and optional listener subscriptions without publishing partial state, exposing generic transaction controls, or gaining authority over resources it does not own.

Plugin definitions must remain portable across runtimes. Installations, staged contributions, registrations, subscriptions, and lifecycle records are runtime-local. The core remains Node.js compatible and has no package discovery, service container, component, or browser domain.

## Goals / Non-Goals

**Goals:**

- Immutable helper-proven PluginClass definitions with canonical `plugin/<slug>` identity.
- A closed staging builder for event definitions, listener definitions, and installation-owned listener bindings.
- Cross-registry validation, deterministic commit order, atomic rollback, and one managed PluginInstallation publication point.
- Protected uninstall and explicit installation-owned cascade with preflight before destructive mutation.
- Awaited non-cancellable lifecycle observation and aggregate failure reporting.
- Runtime isolation and a narrow public facade without generic registries or transaction kernels.

**Non-Goals:**

- Package discovery or loading, dependency/version solving, remote code, manifests, arbitrary services, configuration injection, hot migration, retries, parallel commit, components, renderers, DOM APIs, or browser event adapters.
- Cascading into resources not created and tracked by the installation.
- Replacing active registrations, overriding existing definitions, or installing one PluginClass more than once in one plugin domain.

## Decisions

### Stage through a closed transaction builder

`createPluginClass(slug, contribute)` creates an immutable helper-proven definition. Its awaited contribution callback receives one frozen builder exposing only `addEvent`, `addListener`, and `bindListener`. Calls append descriptors to private transaction state; they never mutate runtime registries and the builder becomes invalid when contribution returns or fails.

`bindListener` references a ListenerClass contributed by the same PluginClass plus an explicit endpoint authority. It does not accept a registration handle or class ID. This makes installation ownership and rollback knowable before commit. Contributions are materialized once with explicit count bounds; duplicate class IDs, duplicate bindings, forged definitions, foreign endpoints, and listener definitions whose EventClass is unavailable after the proposed event commit fail during validation before registry mutation.

Alternative considered: pass EventRuntime directly to the callback. Rejected because any registration would become immediately observable and rollback could not be proven.

### Use prepare, commit, activate, publish

Installation runs one awaited sequence:

1. Allocate an internal diagnostic installation ID and run the contribution callback into isolated staging state.
2. Validate the complete staged graph and every authority without invoking registry mutation.
3. Prepare unpublished event registrations, listener registrations, and installation-owned ListenerInstances in descriptor order.
4. Enter one synchronous commit barrier that publishes every prepared registration and endpoint membership without awaiting user code.
5. Emit the installed lifecycle record against the complete published graph and publish one active PluginInstallation handle.

Any failure before publication releases created listener instances, unregisters committed listener registrations, then unregisters committed event registrations, all in reverse order. Cleanup continues after individual failures and one PluginInstallationError preserves the primary cause and ordered rollback failures. The active installation handle is never observable on failure.

Alternative considered: expose an `installing` handle. Rejected because callers could retain or invoke a resource whose transaction may roll back. Installing remains an internal phase represented only in diagnostics.

### Adapt domain registries through internal transaction ports

EventRuntime owns an internal plugin transaction coordinator with narrow event and listener ports: reserve affected identities and endpoints, prepare unpublished registrations and bindings, publish or discard an exact prepared batch, acquire dependency-admission leases, inspect dependent counts, synchronously withdraw exact handles, and finalize withdrawn resources. Generic `TypedRegistry`, registration definitions, release methods, endpoint membership, and reaction ports remain private.

Preparation may await framework work but prepared resources remain outside active registry maps and endpoint membership. Cross-registry publication is one synchronous critical section with no user callback or promise boundary, so observers see either the prior graph or the complete contribution graph. Failure after publication uses compensating rollback; no failure path may leave only a subset active.

Alternative considered: add a universal transaction API to TypedRegistry. Rejected because it would couple unrelated domains and expose a premature general transaction abstraction.

### Make uninstall preflight non-destructive

`uninstall(installation)` validates ownership and active status, then acquires reversible admission leases on every contributed registration. Leases prevent new dependent retention while leaving current handles readable. It preflights every contributed registration under those leases. If any dependent exists, it releases every lease and throws PluginUninstallDependencyError without releasing subscriptions or unregistering anything. On success one synchronous withdrawal marks every exact registration unavailable before asynchronous cleanup begins; cleanup then finalizes listener and event registrations in reverse commit order, emits lifecycle, clears retained definitions/authorities, and releases the installation.

`cascadeUninstall(installation)` is explicit authority to release only ListenerInstances created and tracked by that installation, in reverse binding order. It then repeats the full dependency preflight. Remaining external dependents still reject uninstallation without unregistering contributions. Failures from owned listener release are collected; registration removal does not begin unless the post-cascade preflight succeeds.

Each installation has one internal operation gate. Repeated uninstall calls using the same mode share the in-flight promise; a protected and cascade operation racing each other fail explicitly rather than silently changing authority. Dependency rejection releases the gate and leaves public managed status active. Only successful synchronous withdrawal crosses the irreversible boundary and moves the installation to disposing.

Alternative considered: cascade every dependent. Rejected because registries count dependencies but do not grant ownership over other holders' instances, and a plugin must not become a global disposal authority.

### Keep lifecycle observation scalar and non-cancellable

PluginLifecyclePhase is the closed enum `installed | uninstalling | released | rollback`. Records are strict-JSON, deeply frozen scalar snapshots containing runtime-qualified installation ID, PluginClass ID, phase, sequence, and timestamp. One optional asynchronous observer is awaited serially; its return value has no control meaning.

An installed-observer failure rolls the installation back. Uninstalling and released observer failures are aggregated after required cleanup continues. Rollback observation is best-effort but its failure is included in rollback failures. Lifecycle payloads never retain PluginClass, registration, endpoint, ListenerInstance, callback, or Error references.

### Keep installation identity separate from PluginClass identity

PluginClass uses canonical `plugin/<slug>` identity. Each successful or failed attempt receives a monotonic runtime-qualified `plugin-installation` instance ID. The plugin domain rejects a second active installation of the same PluginClass in one runtime before contribution execution; the same portable PluginClass may be installed independently in another runtime or reinstalled after complete release.

## Risks / Trade-offs

- **Compensating rollback can itself fail** → Continue every reverse cleanup and preserve all ordered failures in one error; never claim atomic success.
- **Async contribution can retain the builder** → Invalidate it immediately after settlement so later calls fail without mutation.
- **Endpoint release can race installation** → Revalidate every binding authority during preflight and again immediately before ListenerInstance creation; rollback earlier commits if activation fails.
- **Publication could observe a partial binding set** → Prepare registrations and listener resources outside live maps, then publish all registry and endpoint membership changes inside one synchronous barrier.
- **A dependent can race uninstall after preflight** → Hold reversible dependency-admission leases through preflight and synchronously withdraw the full registration set before awaiting cleanup.
- **Protected and cascade uninstall can race** → Serialize through one per-installation operation gate, deduplicate identical operations, and reject conflicting modes before cleanup.
- **Protected uninstall may surprise plugins with owned bindings** → Make cascade a separate explicit operation and report dependent class IDs/counts before mutation.
- **Internal relay-generated listener registrations resemble plugin contributions** → Transaction ports accept only exact prepared handles from this installation and never enumerate or adopt unrelated registrations.
- **Large staged graphs can exhaust memory** → Bound total event definitions, listener definitions, and bindings before materialization.

## Migration Plan

1. Add plugin definitions, staging records, lifecycle records, and errors without changing EventRuntime behavior.
2. Add internal event/listener preparation, admission-lease, synchronous publication/withdrawal ports and a cross-registry coordinator with rollback and race tests.
3. Compose one plugin domain into EventRuntime and expose frozen plugin delegates.
4. Run the full existing event/listener suite to prove no-listener and no-plugin behavior remains unchanged.

Rollback removes the plugin facade and transaction ports; existing event and listener registrations remain source-compatible because plugins only compose their current contracts.

## Open Questions

- The initial staging limits are internal safety constants and may become runtime policy only after real plugin graphs demonstrate a need.
- Plugin-to-plugin dependency solving remains deferred until at least two concrete plugin families establish required semantics.
