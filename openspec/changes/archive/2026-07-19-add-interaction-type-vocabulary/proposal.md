## Why

An interaction is bound today with a free-form string — `bind(root, "click", …)` —
which is dual-purpose: it is both the interaction's identity and the literal native
event name the adapter listens for. With three adapters (Solid, React, Vue) now all
naming interactions with raw strings, an unvalidated string invites divergence: a typo
or an adapter naming an interaction differently is caught by nothing.

This change adds a registered, typed interaction vocabulary that mirrors `EventClass`:
an `InteractionType` gives an interaction a stable identity distinct from the native
event name, so interaction types are validated and normalized. It is **additive** —
the raw-string path keeps working — so nothing breaks and adoption is incremental.

## What Changes

- Add **`createInteractionType(slug, native)`** and `isInteractionType` in
  `@velkren/core`: an immutable, portable `InteractionType` with an id / local slug
  (identity) and a `native` event name (what the adapter captures), mirroring
  `EventClass`.
- Add **`registerInteractionType`** to the interaction-binding domain: an
  `InteractionType` must be registered before it can be bound, and a duplicate local
  slug is rejected (no last-write-wins), mirroring registered event classes.
- **`bind` accepts an `InteractionType` or a raw string.** Given an `InteractionType`,
  it validates the type is registered and resolves its `native` name for the port;
  given a string, it behaves exactly as today. The port and every adapter are
  **unchanged** — they still receive the native string.
- **Migrate the shared two-editor composition** to a registered `InteractionType`,
  demonstrating the vocabulary across all three adapters; the raw-string path stays
  exercised by the membrane and core interaction tests.

## Capabilities

### New Capabilities

<!-- None. This extends the existing interaction-binding capability. -->

### Modified Capabilities

- `interaction-binding`: add a registered, typed interaction vocabulary —
  `InteractionType` (identity distinct from the native event name), registration with
  duplicate rejection, and `bind` accepting a registered `InteractionType` or a raw
  string, resolving the native name for the port with no port or adapter change.

## Impact

- **New**: `createInteractionType` / `isInteractionType`, `registerInteractionType`, and
  the not-registered / duplicate errors in `@velkren/core`.
- **Modified**: `bind`'s type parameter widens to `InteractionType | string`
  (backward-compatible); the shared two-editor composition registers and uses an
  `InteractionType`.
- **Unchanged**: the `RendererPort` (`registerInteraction` still takes a string), and
  every adapter — the native name is resolved core-side.
- **Deferred**: removing the raw-string path entirely (a later breaking change if
  desired); a per-adapter native-name translation table.
