## Context

`InteractionBinding.bind(root, type: string, eventClass, project)` uses the string as
both the interaction identity and the native event name passed to the port
(`registerInteraction(root, type, deliver)` → `addEventListener(type)`). Three adapters
now all name interactions with raw strings. `EventClass` already models a registered,
typed vocabulary (`createEventClass` → id + local slug, registered before use); the
interaction domain lacks the equivalent.

## Goals / Non-Goals

**Goals:**

- A registered, typed `InteractionType` mirroring `EventClass`, with identity distinct
  from the native event name.
- Registration with duplicate rejection (no last-write-wins).
- Additive: `bind` still accepts a raw string; no port or adapter change.

**Non-Goals:**

- Removing the raw-string path (a later breaking change if wanted).
- Changing the `RendererPort` or any adapter.
- A per-adapter native-name translation table.

## Decisions

### 1. `InteractionType` mirrors `EventClass`, plus a `native` name

`createInteractionType(slug, native)` produces an immutable, frozen definition with
`id = createCanonicalClassId("interaction", localSlug)`, `localSlug`, and `native`.
Membership is tracked in a `WeakSet` for `isInteractionType`, exactly as `EventClass`.
The `native` field is the one addition: it separates the interaction's identity from the
native event name, which is the whole point — the string conflated them.

### 2. The vocabulary is a core-side layer above the port

`bind` resolves a native name and passes _that_ to the port, so `registerInteraction`
stays string-typed and no adapter changes. Given an `InteractionType`, `bind` validates
it is registered on this binding domain and uses `type.native`; given a string, it uses
the string directly. The binding's internal `(root, type)` tracking key is the native
name in both paths, so a duplicate binding on one root is still detected per native
event.

- **Alternative rejected**: push the vocabulary into the port so adapters translate
  native names to `InteractionType`. Rejected — it changes the port and every adapter
  for no gain; the binding already knows which type it registered, so the mapping is
  core-side.

### 3. Registration required for an `InteractionType`; strings need none

An `InteractionType` must be registered (`registerInteractionType`) before `bind`, or
`bind` throws `InteractionTypeNotRegisteredError` — mirroring how an `EventClass` must be
registered. Registering a second type with the same local slug throws
`DuplicateInteractionTypeError` (no last-write-wins, per the constitution). The raw-string
path needs no registration, preserving today's behavior.

## Risks / Trade-offs

- **Two `InteractionType`s sharing one `native` on one root** → the second bind is a
  duplicate on that native event, as today; acceptable and detected.
- **The raw-string escape hatch remains** → intended for this additive increment;
  removing it is a recorded future breaking change.
- **Registration adds a step for typed use** → the cost of validation; strings stay
  zero-ceremony.

## Open Questions

- **Removing the raw-string path**: a later breaking change could make `bind` require an
  `InteractionType`, migrating all call sites — deferred.
- **Whether `InteractionType` should carry more than a single `native` name** (e.g. a set
  of native events, or per-adapter names) — deferred until a real divergence appears.
