## Why

Velkren's internal typed registry currently fails immediately when a class is absent, so future domain factories cannot resolve definitions supplied on demand without adding import-order behavior or global scanning. A deterministic namespace-loading boundary is needed now, before events and other public domains depend on class resolution.

## What Changes

- Add internal typed loader registration with explicit namespace ownership and immutable loader identity.
- Resolve a missing canonical class through the deepest registered ancestor namespace, with no fallback to shallower loaders after selection.
- Deduplicate concurrent requests for the same missing class while keeping unrelated class loads independent.
- Stage loader contributions and publish registrations atomically only after the selected load completes and validates.
- Report selection, loading, validation, and conflict failures explicitly without exposing partial registrations.
- Keep the loader kernel, test kinds, plugins, and domain factories outside the public package export map.

## Capabilities

### New Capabilities

- `typed-namespace-loading`: Internal typed namespace loader registration, deterministic missing-class resolution, concurrent-load deduplication, atomic publication, and explicit failure semantics.

### Modified Capabilities

None.

## Impact

- Extends the internal `@velkren/core` registration kernel and its Node.js tests.
- Preserves the existing public core export surface and framework-independent dependency boundary.
- Adds no runtime dependency and no browser, renderer, plugin, event, or UI API.
- Makes `add-semantic-events` eligible only after this loading contract is implemented and archived.
