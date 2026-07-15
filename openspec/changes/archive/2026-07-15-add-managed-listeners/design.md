## Context

The semantic event domain now owns EventClass registration/loading, immutable payload snapshots, managed EventInstance creation, deterministic tracing, and guaranteed release. Dispatch intentionally invokes no reactions. Velkren therefore lacks the next coordination primitive: an explicit runtime-owned place to publish events, deterministic managed subscriptions, middleware ordering, and safe relay between authorities.

Earlier exploration established these boundaries: a listener subscription is one managed instance for one EventClass and one receiver callback; source identity belongs in callback arguments; listener scope is controlled by an owning instance or endpoint rather than a global listener table; nested propagation is an explicit optional relayer; middleware uses awaited `before`/`after` phases; `false` is the only silent short-circuit; exceptions interrupt; lifecycle observation cannot cancel; semantic relays create their own events and do not forward native event objects or `preventDefault` state.

The current core has no component or general Scope domain. This change must therefore earn listener semantics through EventEndpoint capability handles without inventing component lookup, DOM scope, or selector behavior prematurely.

## Goals / Non-Goals

**Goals:**

- Public immutable ListenerClass definitions and runtime-owned registrations.
- Factory-created ListenerInstance subscriptions with active-only callback capabilities and deterministic cleanup.
- Managed EventEndpoint instances as explicit publication and subscription authorities.
- Separate public endpoint handles and private endpoint controllers, authorized by opaque runtime ownership and possession.
- Deterministic listener ordering and awaited onion `before`/`after` middleware.
- Explicit `false` short-circuiting, exception interruption, failure aggregation, and listener lifecycle observation.
- Relayers as managed listeners that map one semantic snapshot into a newly dispatched event on another endpoint.
- Integration with EventRuntime dispatch, tracing, and EventInstance finalization without browser or renderer types.

**Non-Goals:**

- Native browser sources, DOM propagation, bubbling/capture, `preventDefault`, selectors, components, general scopes, plugins, renderer integration, or reactive primitives.
- Multiple event patterns per ListenerClass, wildcard subscription, priority mutation, parallel listener execution, retries, queues, persistence, remote transport, or cross-runtime relay.
- A global event bus, centralized application listener inventory, stopped lifecycle status, or cancellable lifecycle observations.

## Decisions

### Make EventEndpoint a managed capability boundary

`EventRuntime.createEndpoint()` creates one managed endpoint with a runtime-qualified endpoint ID. The returned public `EventEndpoint` is a frozen runtime-owned capability that can publish on the public channel and can be used to bind public listeners. Its paired `PrivateEventEndpoint` controller is a separate frozen runtime-owned capability that additionally publishes and binds on the private channel and releases the endpoint.

Endpoint state, listener membership, and private authority live in WeakMaps. IDs remain diagnostic only. There is no lookup by endpoint ID. A same-runtime endpoint capability may be passed to any holder; possession is the intended authority. Foreign, forged, or released handles fail before payload traversal or callback execution.

Every EventRuntime owns a permanent default endpoint/controller pair. Existing `EventRuntime.dispatch()` publishes through the default public endpoint, preserving one convenience path while making reaction scope explicit. Releasing the default endpoint is not public.

Alternative considered: use a runtime-global listener registry. Rejected because it removes locality, makes nested ownership implicit, and cannot later map cleanly to component scopes.

### Keep ListenerClass portable and ListenerInstance owned

`createListenerClass(slug, eventClass, callback, middleware)` returns an immutable helper-proven definition with canonical `listener/<slug>` identity. It subscribes to exactly one EventClass. The callback receives one frozen context containing the active EventInstance, source EventEndpoint, channel, and ListenerInstance; source is not encoded into payload.

ListenerClass definitions are reusable across runtimes. EventRuntime registration creates a protected domain handle. `listen(registration, endpoint authority)` creates one managed ListenerInstance, retains its class registration and endpoint, and installs it at the endpoint's next monotonic sequence. ListenerInstance release removes membership and clears callback/class/endpoint references; endpoint release immediately prevents new publication/subscription, releases owned listeners in reverse installation order, and aggregates failures. An already executing callback continues from its local frozen context, while its publication snapshot skips later listeners that endpoint release has made inactive. Endpoint release does not wait for the publication that may have requested that release, avoiding callback self-deadlock.

Alternative considered: allow one ListenerClass to subscribe to multiple events. Rejected because callback-side routing hides type identity and complicates cleanup; applications can compose multiple ListenerClasses explicitly.

### Model public and private as two explicit channels

`EventChannel` is the closed enum `public | private`. Public publication reaches only public listeners. Private publication reaches only private listeners and requires the controller capability. There is no automatic cross-channel fan-out. A listener's channel is fixed when its instance is created.

This is capability privacy, not cryptographic secrecy: an application that deliberately shares a private controller shares its authority. Strings, IDs, and endpoint object shape never recreate that authority.

Alternative considered: visibility flags on a single endpoint handle. Rejected because runtime checks on a caller-supplied flag do not prove private authority.

### Execute listeners serially in installation order

An endpoint snapshots its active matching listener sequence at publication start and executes it serially. Listeners installed during publication do not join that publication. A listener released before its turn is skipped explicitly. Reentrant and nested publication are allowed because each publication owns its own immutable sequence snapshot; no global dispatch cursor exists.

Listener callbacks and before middleware may be synchronous or asynchronous, but the executor always awaits them. Their return values must be exactly `undefined` or boolean `false`; promises are awaited, truthy substitutes are contract errors. `false` ends the current endpoint publication successfully and no later listener runs. After hooks must resolve to exactly `undefined`; `false` or any other value is an after failure but never prevents the remaining entered hooks from unwinding. Exceptions or invalid returns end publication as failure.

Alternative considered: parallel listeners. Rejected because it makes short-circuit, ordering, relay, and cleanup nondeterministic.

### Use explicit onion before/after middleware

Middleware definitions are immutable helper-proven pairs with optional `before(context)` and `after(context, outcome)` hooks. ListenerClass stores an immutable ordered list. For one listener, `before` hooks run outer-to-inner, the callback runs once, and `after` hooks for successfully entered middleware run inner-to-outer.

A `before` or callback result of `false` marks a silent short-circuit. Already-entered `after` hooks still run with a frozen outcome. A thrown `before` or callback error interrupts normal execution; a thrown or invalid-returning `after` hook is collected while remaining entered `after` hooks still run for cleanup. The executor reports one ListenerExecutionError with the primary and ordered after failures; it does not add a `stopped` lifecycle status.

Alternative considered: callback-style `next()` middleware. Rejected because it permits zero/multiple continuation calls and makes awaited ordering harder to verify. Explicit phases provide onion semantics with a single framework-owned loop.

### Integrate reaction inside semantic dispatch finalization

Endpoint publication resolves/loads EventClass, creates one EventInstance, emits its created trace, executes matching listeners, then completes and releases through the existing guaranteed dispatch path. Listener failure becomes the dispatch primary cause; trace and release failures remain separately aggregated by EventDispatchError. Pre-instance failure still emits only failed trace.

The EventDispatcher receives an optional reaction port rather than importing endpoint storage. This preserves dependency direction: EventRuntime composes dispatcher and listener domain, while event snapshot/trace/lifecycle kernels remain ignorant of subscriptions.

### Implement relayers as listener factories, not a second propagation system

`relay(source authority, source EventClass, target authority, target EventClass, map)` creates a managed ListenerInstance whose callback reads the source EventInstance snapshot, calls the synchronous or asynchronous mapper, and publishes the returned payload as a new semantic event through the target channel. The target dispatch creates a fresh EventInstance, snapshot, identity, transcript, and lifecycle.

Relayers never forward the source EventInstance, raw source, trace Error objects, native event state, or cancellation/default-prevention state. Source and target must belong to the same Runtime. A per-publication relay-depth limit fails explicitly on cycles; no cross-runtime bridge is inferred.

Alternative considered: pass the same EventInstance between endpoints. Rejected because one instance cannot have two independent owners, phases, snapshots, traces, or browser-source lifetimes.

### Observe lifecycle without granting control

EventRuntime accepts an optional awaited listener lifecycle observer. It receives deeply frozen scalar records for caller-created endpoint created/released and listener installed/released phases. The permanent internal default endpoint is established synchronously with EventRuntime composition before the observer pipeline becomes operable and emits no synthetic creation record. Records contain IDs, phase, sequence, timestamp, class ID when applicable, channel, and strict-JSON framework payload. Observer return values are ignored and cannot short-circuit or cancel. Failure while observing endpoint creation or listener installation rolls the new resource back before the operation rejects, so no unreachable live resource remains. Failure while observing release is aggregated after required cleanup continues.

Lifecycle observations are not semantic publications, avoiding recursion during endpoint/listener construction. A closed `ListenerLifecyclePhase` enum prevents ambiguous free-form phases.

## Risks / Trade-offs

- **A slow listener or observer delays publication** → Await serially by contract, expose trace timing, and defer concurrency/timeout policy until measured use cases exist.
- **Reentrant relayers can create cycles** → Track publication depth in internal context and fail at a conservative bound without fabricating cross-runtime propagation.
- **A callback retains EventInstance or context** → Active capabilities still fail after release; runtime state clears its own references, while application retention remains application responsibility.
- **Endpoint release races with publication** → Release prevents new work and removes listener membership immediately; the currently executing callback may finish from local context, later snapshotted listeners are skipped, and release never waits on its own publication.
- **After hooks can fail while handling another error** → Preserve the primary cause and every ordered after failure in one execution error.
- **Private controller sharing broadens authority** → Document possession semantics and make the controller opaque, frozen, owner-validated, and non-reconstructible from IDs.
- **Default endpoint convenience can look global** → It is scoped to one EventRuntime, never process-global, and explicit endpoints remain the coordination primitive for nested ownership.

## Migration Plan

1. Add endpoint/channel identities, managed endpoint/controller capabilities, leases, and lifecycle records.
2. Add ListenerClass and middleware definitions with immutable provenance and return contracts.
3. Add listener registration, ListenerFactory, ListenerInstance membership, and cleanup.
4. Add serial publication reaction and integrate it into EventDispatcher through a reaction port.
5. Add managed relayers, relay-depth protection, and nested dispatch tests.
6. Expose only domain APIs, run full verification/adversarial review, sync specs, and archive.

Rollback is a normal revert. Existing EventRuntime dispatch remains source-compatible and uses the default public endpoint; applications with no listeners retain the same phase and trace behavior.

## Open Questions

- The initial relay-depth limit is an internal safety constant and may become runtime policy only after real component graphs demonstrate a need.
- General component-owned scopes and automatic owner-following beyond endpoint release remain deferred to `add-component-runtime`.
