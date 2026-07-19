## Context

The ephemeral membrane mints and owns a runtime per element and disposes it on
confirmed detach — so a view's state dies with its element. A persistent multi-view
document needs state that outlives any one view.

Grounding in the runtime showed the interaction, event, and component domains are each
**unique per runtime** (`DuplicateInteractionRuntimeError`, `DuplicateEventRuntimeError`,
`DuplicateComponentRuntimeError`), and `createInteractionBinding` binds through a single
projection runtime. A shared _interactive_ runtime across views is therefore blocked by
design — "one runtime = one view/app."

## Goals / Non-Goals

**Goals:**

- Prove and document durability as a composition pattern over the ephemeral membrane.
- State lives in a host-owned service and outlives any view; views are ephemeral.
- Cross-view coordination is app-wired through the service.
- No `@velkren/core`, `RendererPort`, or membrane change.

**Non-Goals:**

- A shared interactive runtime across views (relaxing per-runtime uniqueness).
- A Velkren-owned durability / persistence abstraction.
- Server persistence, data fetching (application concerns).

## Decisions

### 1. Durability is an application-service concern, not a runtime concern

Document state lives in a host-owned **service** (a plain application object, not a
managed instance of any runtime). Each view is an ordinary ephemeral membrane whose
component references the service through its scope. Detaching a view disposes only its
own runtime; the service and its state are untouched because they are not owned by any
runtime. This is exactly where PROJECT.md places state: "applications own their
definitions, policies, services." Per-runtime uniqueness is then a feature — sharing
happens at the service level.

- **Alternative rejected**: a **shared interactive runtime** across views. It would
  require relaxing the per-runtime uniqueness of the event, component, and interaction
  domains, and decoupling the interaction binding from a single projection runtime —
  a change to a constitutional-adjacent boundary. Rejected: durability does not need it,
  and Velkren is explicitly not a data-owning framework. Its one advantage — shared
  Velkren semantic events across views — is replaced by the service's own subscription.

### 2. Cross-view sync via the service's subscription

The service exposes `get`, `set`, and `subscribe`. Each view subscribes on mount and
re-commits its projection when the service changes; an interaction in one view calls
`set`, and every subscribed view re-renders. This keeps coordination explicit and
app-owned, not implicit through DOM or a shared runtime.

### 3. Views stay ephemeral; the membrane is unchanged

Each view is a plain `defineVelkrenElement` membrane whose factory mints a runtime,
composes a component that reads the service, subscribes for updates, and disposes its
runtime (and its service subscription) on detach. The membrane's ephemeral ownership
and move-safety are reused as-is.

## Risks / Trade-offs

- **No shared Velkren semantic events across views** → cross-view sync is via the
  service's subscription instead; acceptable and consistent with app-owned coordination.
- **Each view re-registers its own domains** → the cost of runtime isolation; the same
  isolation that makes views independent and disposable.
- **A leaked service subscription would outlive a view** → the view's `dispose`
  unsubscribes; the validation asserts a disposed view stops receiving updates.

## Open Questions

- **A reusable service/binding helper**: the pattern is currently hand-wired in the
  validation. A small adapter-side helper (subscribe-and-recommit) could reduce
  boilerplate later; out of scope here to keep the pattern explicit first.
- **Cross-view sync via a relayer instead of a bare subscription**: a future refinement
  could route service changes through a Velkren relayer per view for inspectability.
