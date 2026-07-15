## Why

Velkren now has isolated typed registration, deterministic namespace loading, managed factories, and lifecycle cleanup, but no public runtime domain proves these mechanisms as one coherent API. Semantic events are the smallest domain that can establish immutable data boundaries, short-lived managed instances, safe diagnostics, and domain-specific registration without introducing rendering or component coordination.

## What Changes

- Add public immutable EventClass definitions with validated local slugs and closed top-level payload schemas.
- Add a public event-domain runtime facade that owns EventClass registration, event-specific namespace loading, resolution, creation, and programmatic dispatch while keeping generic kernels internal.
- Validate payloads as strict JSON data, reject unknown or invalid fields, and create deeply cloned and frozen snapshots before event behavior becomes observable.
- Add managed EventInstance identity and lifecycle with active-only raw source and snapshot access; release clears all live references.
- Add programmatic dispatch that deterministically validates, creates, traces completion or failure, and releases the event exactly once.
- Add immutable, JSON-safe trace records that preserve diagnostic identity, lifecycle phase, timing, and snapshot data without retaining EventInstance, raw source, schema callback, or other live references.
- Keep listeners, endpoints, middleware, relayers, native browser adapters, cancellation, UI events, plugins, and component integration out of scope.

## Capabilities

### New Capabilities

- `semantic-events`: Public EventClass schemas, event-domain registration/loading facade, EventFactory and EventInstance lifecycle, programmatic dispatch, immutable JSON snapshots, and safe trace records.

### Modified Capabilities

None.

## Impact

- Adds the first public domain-specific APIs to `@velkren/core` without exposing generic registration or loader internals.
- Extends runtime composition with an event-domain facade paired to one existing runtime.
- Exercises typed namespace loading through event-specific loader contracts.
- Adds Node.js tests only and introduces no runtime dependency, DOM type, renderer, reactive library, or browser API.
- Makes `add-managed-listeners` eligible only after this event data, identity, trace, and lifecycle contract is implemented and archived.
