## Context

The core now provides opaque runtime ownership, managed lifecycle, immutable typed definitions, atomic registration, managed factories, and explicit typed namespace loading. Those mechanisms remain mostly internal. Semantic events are the first public domain and must prove that a domain-specific facade can expose useful registration, loading, creation, tracing, and cleanup without leaking generic kernels or browser semantics.

Earlier exploration established several boundaries: event data becomes framework-owned at first receipt; raw browser objects are references with unreliable host lifetimes; relayed events will later be semantic instances rather than native events; prevent-default behavior belongs to the first native adapter and is not part of semantic dispatch; lifecycle observation cannot cancel; and released objects must clear live references.

## Goals / Non-Goals

**Goals:**

- Public EventClass, event-domain runtime, EventFactory, EventInstance, schema, phase, trace, and dispatch contracts.
- Closed top-level schemas plus strict recursive JSON validation.
- Detached, deterministic, deeply frozen snapshots.
- Runtime-owned EventClass registration and event-specific namespace loading.
- Guaranteed short-lived event release and safe immutable trace transcripts.
- Optional ordered async tracing with explicit failure reporting.

**Non-Goals:**

- ListenerClass, EventEndpoint, public/private channels, middleware, relayers, propagation, cancellation, or default prevention.
- Native browser event adapters, DOM types, UI events, components, plugins, rendering, layout, or reactive integration.
- General JSON Schema compatibility, coercion, default values, schema evolution, persistence, or remote serialization protocols.

## Decisions

### Expose a domain facade, not generic kernels

`createEventRuntime(runtime, options)` creates exactly one event-domain facade paired to an existing Runtime. It owns internal event-kind definitions, typed class registry, event loader registry, namespace resolver, EventFactory, event identity sequence, and trace sink. A WeakMap keyed by Runtime rejects duplicate facade creation rather than sharing or replacing configured state. Public methods are event-specific: define/register/replace/unregister EventClass, register event namespace loaders, create, and dispatch. Registration, resolution, and loading return a public owner-validated `EventClassRegistration` wrapper rather than the generic kernel handle. Generic `TypedRegistry`, `TypedLoaderRegistry`, and `TypedNamespaceResolver` remain outside the export map.

This earns the first public typed domain without freezing a generic extension API before plugins and another domain prove its shape.

### Use declarative closed top-level fields with validator functions

An EventClass schema is an immutable record from field name to an immutable descriptor containing `required` and a synchronous predicate. Field names use a conservative identifier grammar and reserved framework envelope names are rejected. Schema descriptors are framework-created and branded internally so frozen structural imitations do not pass registration.

The schema owns the exact top-level key set. Validators refine field meaning but do not control traversal, cloning, freezing, lifecycle, or trace serialization. A validator must return the boolean primitive; promises and other values are contract errors. Async validators, coercion, defaults, transforms, and nested schema DSLs are deferred. A thrown predicate is wrapped as validation failure with the field path.

### Define strict JSON independently of `JSON.stringify`

The snapshot builder uses property descriptors and traverses input without intentionally invoking `toJSON` or ordinary getters. It accepts null, strings, booleans, finite numbers, dense arrays, and non-proxy plain objects with `Object.prototype` or null prototype. It rejects accessors, symbol keys, sparse arrays, unsupported primitives, observably non-plain prototypes, and cycles. Shared acyclic references are copied independently, producing a tree.

ECMAScript has no portable, browser-neutral operation that detects Proxy objects without interacting with their meta-traps. Proxy input is therefore outside the caller contract. Reflection may execute traps when a caller violates that contract; the runtime validates the descriptors returned by those traps but does not claim a sandbox boundary against adversarial objects.

Top-level fields are copied in EventClass schema order; nested object keys are copied in sorted order. The normalized tree is serialized once and deeply frozen. This produces deterministic trace content and prevents caller mutation. Size/depth limits are internal constants to bound CPU and memory.

### Keep raw source and snapshot active-only

EventInstance state lives in WeakMaps. The optional raw source is never cloned, frozen, serialized, or traced. The normalized snapshot object and canonical JSON text are also held only in managed state. Getters assert active lifecycle. Release removes all three before the standard lifecycle reaches its tombstone.

This supports future browser adapters without pretending host objects are durable. If user code retains its own raw reference, that is outside the runtime's retention guarantee.

### Make phases framework-owned and non-cancellable

The public `EventPhase` enum contains created, completed, failed, and released. Only the event kernel advances phase. Phase records are observations, not dispatchable events, and sinks return no control value. There is no stopped state and no `preventDefault` field.

Dispatch allocates a runtime-qualified diagnostic event ID before resolution. This scalar allocation does not create or publish a managed object. If factory creation succeeds, it adopts that same ID for the EventInstance; if resolution, loading, or validation fails first, the ID still anchors a safe failed trace and no release phase is fabricated for a nonexistent instance.

The factory creates an active instance in created phase. Programmatic dispatch has no listener reaction in this change; successful completion means resolution, validation, creation, and created-phase tracing succeeded. The instance then advances to completed, emits its record, releases in `finally`, and emits released. Any failure advances to failed when an instance exists, then still releases.

### Build traces as detached JSON records

Trace records contain scalar IDs, phase, monotonic per-domain sequence, epoch timestamps, outcome classification/message, and a fresh detached snapshot parsed from canonical snapshot text for phases that expose payload data. Records and transcripts are deeply frozen. They never contain Error, EventInstance, registration, definition, validator, raw source, or input references.

A caller-provided async sink is awaited serially. A no-op sink object is always installed when omitted so dispatch has one execution path. Sink failures are collected, converted to safe diagnostics, and do not prevent release. Dispatch throws one `EventDispatchError` with the primary cause and immutable lists of trace and release failures; raw Error objects may be exposed on the thrown operational error to the immediate caller but never enter trace records.

### Separate creation from dispatch finalization

EventFactory can create an active EventInstance for controlled integrations and tests; the caller then owns release. `EventRuntime.dispatch` is the safe convenience path and always finalizes. Factory creation validates registration ownership before payload traversal, initializes managed identity/lifecycle before publishing the instance, and rolls back on every post-allocation failure.

The event runtime resolves an active EventClass first and invokes event-specific namespace loading only when missing. Loader contributions can contain only helper-proven EventClass definitions inside the selected namespace and publish through the existing atomic batch kernel.

### Preserve dependency direction

```text
public EventRuntime facade
    ↓
EventFactory, snapshot, trace, and dispatch kernels
    ↓
event-specific adapters over typed resolver/registries
    ↓
ownership, lifecycle, identity, and error primitives
```

Core event modules remain Node.js-compatible and import no DOM or renderer types.

## Risks / Trade-offs

- **Validator callbacks can retain the detached value they inspect** → Validators receive framework-owned copies, and retention by application callbacks is explicitly application responsibility; the runtime itself clears its references.
- **Deep payloads can exhaust resources** → Enforce internal depth, node-count, string-length, and serialized-byte limits before instance publication.
- **Proxy meta-traps can run during reflection** → Make non-proxy input a caller obligation, avoid ordinary property reads, and reject every unsupported shape visible through returned descriptors.
- **A trace sink can be slow or fail** → Await records in order, collect failures explicitly, and always run event release.
- **Returning operational Error causes can retain application data** → Trace data never contains Error objects; the immediate thrown dispatch error is short-lived caller-facing diagnostics and release clears runtime references.
- **Public event loaders could expose generic loading semantics accidentally** → Accept and return only EventClass-specific definitions and keep generic loader handles inaccessible.
- **Creation without dispatch permits longer-lived events** → Document caller-owned release and retain EventRuntime dispatch as the default convenience path.

## Migration Plan

1. Add strict JSON normalization, limits, deterministic serialization, and deep-freeze tests.
2. Add EventField/EventSchema/EventClass helpers with provenance and closed-schema validation.
3. Add public EventInstance and EventFactory over managed lifecycle.
4. Add safe trace records, sink, dispatch finalization, and aggregated errors.
5. Add EventRuntime registration/loading facade using internal typed kernels.
6. Review public exports, run the complete Definition of Done, sync specs, and archive.

Rollback is a normal revert. No existing public event consumer requires migration.

## Open Questions

- Concrete payload size limits will start as conservative internal constants and may become runtime policy only after a real application demonstrates the need.
- Trace transcript retention beyond the returned dispatch result is caller-owned; a bounded runtime trace buffer remains deferred to debugger tooling.
