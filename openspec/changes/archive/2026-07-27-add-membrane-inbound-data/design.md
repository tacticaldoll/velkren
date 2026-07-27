## Context

`packages/element/src/index.ts` is the renderer-agnostic membrane core (see
`element-membrane` spec). Today `MembraneMountContext<R>` exposes only
`renderer`, `element`, and `dispatchBoundaryEvent` (outward-only). The
membrane element class (`VelkrenMembraneElement`, built lazily in
`getMembraneBase()`) has no `observedAttributes`, no
`attributeChangedCallback`, and no property interception of any kind — a
host currently reads an attribute at most once, imperatively, inside its own
`mount()` body (e.g. `element.getAttribute("editor-id")` in every adapter's
membrane test), never observed for change and never routed through a
binding.

The existing state/binding domain already provides exactly the boundary this
change needs, unmodified:

- `StateRuntime.create<T>(initial)` → `StateHandle<T>` (`packages/core/src/state-runtime.ts`).
- `StateHandle.update(next)` internally calls `toStateValue` → `createJsonSnapshot`
  and throws `InvalidStateValueError` for anything that isn't strict JSON
  (no functions, no live object references, no cycles) — `state-runtime.ts:79-90,123-150`.
- `StateBinding.bind(root, state, derive)` re-derives and commits a
  `RenderNode` on every `state.observe` firing (`packages/core/src/state-binding.ts`).

Because `StateHandle.update` already is the canonical "snapshot-or-reject"
boundary, this change adds **zero** new exports to `@velkren/core`'s public
surface — the membrane only needs to relay a raw value to whatever handler
the host factory registers, and the host factory's handler is expected to
call `stateHandle.update(value)` itself.

**Reconciling this with "Authority stays inside the runtime."** The existing
`element-membrane` spec requires that a membrane surface "MUST NOT grant the
ability to operate a managed instance: not its tag, not its attributes, and
not a value read from the element." Read literally, this crossing is exactly
"a value read from the element" reaching runtime state — so it is worth
being explicit about why that requirement still holds. The requirement is
about _authority_, not data: it forbids the element surface from handing an
outside party the _ability to operate_ a managed instance (an owner-validated
reference, a capability, a way to call runtime methods). This change grants
none of that — the attribute/property value only ever reaches a `StateHandle`
that the **host factory itself already owns** from its own `mount()`
composition; the crossing is a data conduit into authority the host already
holds, not a new grant of authority to the DOM or to arbitrary host code that
didn't already possess it. This mirrors `PROJECT.md`'s invariant that
"strings, DOM attributes, and selectors never grant runtime ownership" — the
attribute here never grants anything; it only supplies a value the
already-owning host chooses to apply through the already-existing
`StateHandle.update` boundary.

## Goals / Non-Goals

**Goals:**

- An HTML attribute change and a host-assigned data property both cross
  inward as a raw value delivered to a host-registered handler, with the
  handler firing once immediately (the current value) and again on every
  later change.
- A crossing never mutates runtime state directly from
  `@velkren/element` — the membrane only relays; the host factory's handler
  is the one that calls into the state/binding domain.
- A handler that throws (e.g. because it called `stateHandle.update` with
  invalid data) is caught and reported through the existing
  `reportMembraneError` channel, never propagated synchronously out of
  `attributeChangedCallback` or a property setter.
- A pre-mount crossing (attribute present at upgrade time, or a property
  assigned before connection) is not lost — it is buffered and delivered as
  the initial value once a handler registers.
- Identical behavior across all three adapters, with zero adapter-package
  code change (only their membrane test files gain a new test), since all
  three consume the same `@velkren/element` core through a thin wrapper.

**Non-Goals:**

- No typed props contract — `dataProperties`/`observedAttributes` are plain
  string-keyed, untyped crossings; a typed contract is `add-typed-view-props`,
  a separate, already-queued backlog item.
- No sealing/proxying of the element against an undeclared property
  assignment. Only the declared `dataProperties` names get an accessor;
  any other property name behaves as ordinary `HTMLElement` property
  assignment, exactly as today. "The property channel is reserved" is
  satisfied by scoping what the _declared_ names are for and by rejecting
  invalid _data_ on those names (via `StateHandle.update`'s existing
  validation) — not by technically locking out every other conceivable
  property, which would need proxying the whole element (a materially larger
  change, and not what a real host embedding a component needs).
- No authorization/capability-handoff mechanism. `element-membrane`'s
  existing "Authority stays inside the runtime" requirement already forbids
  granting operate-authority through the element surface, and there is no
  existing mechanism for an external, unowned reference to enter a runtime
  from outside — building one is a separate, security-sensitive design this
  change does not attempt.
- No new `@velkren/core` export.

## Decisions

- **Attributes use the platform's own opt-in mechanism.** Add
  `static get observedAttributes()` to the shared `VelkrenMembraneElement`
  base class, reading `this.membraneConfig?.observedAttributes` (a static
  getter's `this` is the specific per-tag subclass at call time, and
  `defineMembraneElement` already attaches `membraneConfig` to that subclass
  _before_ calling `customElements.define`, which is when the platform reads
  `observedAttributes` — so timing is correct). `attributeChangedCallback`
  updates a per-instance `#attributeValues: Map<string, string | null>` and,
  if any handler is registered for that name, invokes each with the new
  value inside a try/catch that reports a throw via `reportMembraneError`.
- **Data properties use per-instance accessors, defined in the
  constructor.** For each name in `config.dataProperties`, define an accessor
  property (`Object.defineProperty(this, name, { get, set })`) in the
  membrane element's constructor — not in `connectedCallback` — because a
  host may assign a property immediately after `document.createElement(tag)`,
  before the element is ever connected (a common framework pattern: create,
  configure, then insert). The constructor already has `membraneConfig`
  available (attached to the subclass before any instance can be constructed,
  since construction only happens after `customElements.define`). The setter
  records the raw assigned value in a per-instance
  `#propertyValues: Map<string, unknown>` and dispatches to any registered
  handler the same way attributes do; the getter returns the last recorded
  value.
- **Buffering, not event replay.** Both maps hold only the _current_ value
  per name, not a change log. `onAttributeChange`/`onPropertyAssign`
  immediately invoke the handler with whatever is currently buffered (`null`/
  `undefined` if nothing has arrived yet) at registration time, then add the
  handler to the dispatch set for future changes. This matches
  `StateBinding.bind`'s own "derive immediately, then react" shape
  (`state-binding.ts`), so the crossing behaves like the rest of the runtime.
- **Handler registration is per-mount, not persistent.** `#attributeHandlers`
  and `#propertyHandlers` (each `Map<string, Set<handler>>`) are reset to
  empty at the start of every _fresh_ mount (inside `connectedCallback`'s
  fresh-mount branch, alongside the existing `#generation` bump) — a DOM move
  (disconnect+reconnect within the grace window) does not touch them, since
  that branch is skipped when `#mount !== undefined`, exactly like the
  existing projection/state preservation. A confirmed detach followed by a
  genuinely new mount gets fresh handler sets (old handlers must not fire
  into a disposed composition's released `StateHandle`), while
  `#attributeValues`/`#propertyValues` themselves are **not** reset — they
  describe the element's current DOM/property state independent of mount
  generation, so a new mount's handler immediately receives the
  already-current value rather than `null`/`undefined`.
- **No validation logic added to `@velkren/element`.** The membrane relays
  raw values only. Reusing `StateHandle.update`'s existing validation (rather
  than duplicating a snapshot check in `@velkren/element`) is what keeps this
  change from touching `@velkren/core`'s public surface at all and avoids two
  packages independently implementing "is this strict JSON" with the risk of
  drift between them.
- **`onAttributeChange`/`onPropertyAssign` return an unsubscribe function**,
  matching the existing disposer-returning shape of `StateHandle.observe` →
  `StateSubscription.remove()` and `StateBinding.bind` →
  `StateBindingHandle.release()`, for API consistency even though a mount's
  handlers are normally just discarded whole on disposal.

## Risks / Trade-offs

- **A host factory forgets to catch `InvalidStateValueError` itself** →
  not a risk: the membrane wraps every handler invocation in try/catch
  regardless of what the handler does internally, so an uncaught
  `stateHandle.update` rejection inside a host handler is still caught at the
  membrane boundary and reported through `reportMembraneError`, never
  reaching the DOM callback.
- **A property accessor defined in the constructor could shadow an
  inherited `HTMLElement` property** if a host mistakenly declares a
  `dataProperties` name that collides with a real DOM property (e.g. `"id"`
  or `"title"`) → Mitigation: this is a host configuration error, not a
  runtime hazard (the accessor still round-trips a value predictably); not
  worth guarding against defensively for a first increment, since the
  existing view-registry precedent (attributes as props) has the same class
  of "don't name a data field like a platform property" caveat.
- **Buffering only the current value, not a full change history**, means a
  handler registered late (e.g. after several rapid attribute changes) only
  ever sees the latest value, never the intermediate ones → intentional
  (matches state semantics elsewhere in the runtime — `StateHandle.read()`
  is likewise always "current value," not a log).
- **No enforcement against an arbitrary undeclared property** — documented
  as a Non-Goal above; not a defect, a deliberately scoped boundary.

## Migration Plan

Additive only. No existing `MembraneConfig`/`MembraneMountContext` field
changes shape or meaning; both new config fields are optional and both new
context methods are new, so an existing membrane definition is unaffected
without any change on its part.

## Open Questions

None outstanding.
