## Why

Velkren can define, load, validate, trace, and release semantic events, but applications still have no runtime-owned way to react to them or relay them between explicit authorities. Managed listeners are the next required coordination layer because plugins and components must depend on deterministic subscription, middleware, and cleanup semantics rather than callbacks stored in ad hoc application structures.

## What Changes

- Add runtime-owned EventEndpoint handles with explicit public and private publication channels; endpoint possession and opaque ownership, not string selectors, authorize interaction.
- Add immutable ListenerClass definitions, runtime registrations, and factory-created ListenerInstance subscriptions that each bind one semantic event class to one receiver callback.
- Add ordered asynchronous onion middleware with `before`/`after` behavior, explicit `false` short-circuiting, exception-based failure, and guaranteed cleanup.
- Add relayers as managed listener compositions that receive one EventInstance and publish a newly created semantic event through another endpoint without forwarding raw browser event state.
- Add observable, non-cancellable listener and endpoint lifecycle events without adding a stopped lifecycle state.
- Extend EventRuntime dispatch so public endpoint publication invokes managed listeners deterministically before event completion and release.
- Keep browser-native event sources, DOM propagation, `preventDefault`, selectors, components, plugins, and renderer integration out of scope.

## Capabilities

### New Capabilities

- `managed-listeners`: EventEndpoint authority, ListenerClass and ListenerInstance lifecycle, public/private channels, onion middleware, deterministic callback execution, relayers, and cleanup.

### Modified Capabilities

- `semantic-events`: Programmatic dispatch gains endpoint-scoped managed listener reaction while preserving immutable snapshots, tracing, failure aggregation, and guaranteed EventInstance release.

## Impact

- Extends the public `@velkren/core` event-domain API and its runtime-owned registries, factories, errors, lifecycle observations, and tests.
- Adds no runtime dependency, DOM type, browser API, selector mechanism, renderer primitive, or reactive library.
- Makes `add-plugin-transactions` eligible only after endpoint/listener ownership, ordering, relay, and cleanup contracts are implemented and archived.
