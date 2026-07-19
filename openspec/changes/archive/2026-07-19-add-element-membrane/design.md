## Context

Velkren is renderer-agnostic (proven on Solid and React) and recently relocated
identity and interaction capture onto an adapter-owned per-root container
(`refactor-container-anchor`). Every current path to using a Velkren component
still begins inside a Velkren-aware application. This change adds the _distribution
boundary_: a custom element that lets a non-Velkren host page embed a Velkren
component.

The membrane is the one place where two lineages meet. Web Component frameworks
achieve portability by making the DOM element the shared source of truth; Velkren
achieves it by making the DOM a non-authoritative projection. The membrane must
wear a custom-element skin at the edge **without** letting the element become the
authority — otherwise it violates the constitutional invariants that runtime state
is authoritative and the surface is disposable/repairable. Almost all of the
membrane's substance is reuse: it _is_ the per-root container (interaction +
repairable identity), it relays outward events through the existing relayer domain,
and it forwards semantic events' already-immutable snapshots. The genuinely new work
is narrow and lives entirely in the adapter/membrane layer.

## Scope of this increment

This change implements the **minimal, purely-additive first increment** of the
membrane: a **light-DOM, ephemeral** membrane in the Solid adapter. Grounding in the
code confirmed it needs no `@velkren/core` change and no adapter-contract change —
the membrane passes the custom element as the adapter's existing
`createSolidRenderer({ container })`, reuses the per-root container anchor for
interaction and identity, and observes emission through the event domain's trace.

The Decisions below document the _whole_ membrane line (the rationale that produced
this increment); the parts they describe that are **not** in this increment are
called out and deferred to their own follow-on changes: **inbound data crossings**
(attribute/property → snapshot → binding), the **durable/borrowed lifetime** (and
resilience to a runtime disposed out from under the membrane), the **shadow-DOM
surface** (`composedPath` capture, interior-styles channel), and the **outward
semantic-event → `CustomEvent` relay**.

## Goals / Non-Goals

**Goals (this increment):**

- Let a host place a Velkren component as a custom element with one prior
  registration and then declarative markup.
- Keep all authority (identity, scope, lifecycle, binding, capability) inside the
  runtime; the element is a dumb projection surface.
- Reuse render-root-projection, interaction-binding/container-anchor, and the
  component/template/event/projection runtimes rather than adding core contracts.
- Keep `@velkren/core` host-blind: no DOM/`CustomEvent` type, no boundary-public
  marking.
- Ephemeral (DOM-lifetime) ownership with no refcounting; move-safe detach.
- Reproduce the two-editor guarantees through the boundary.

**Non-Goals (deferred to follow-on changes):**

- Inbound data crossings — attribute/property → snapshot → binding.
- A durable host-owned lifetime — borrowed scope / projectable reference, and
  resilience to a runtime disposed out from under the membrane.
- A shadow-DOM surface — `composedPath` interaction capture and the interior-styles
  channel.
- An outward semantic-event → `CustomEvent` relay (notification-only).

**Non-Goals (the broader membrane line, as before):**

- Slotted native nesting — a native view hosting Velkren-managed children
  (`add-native-nested-views`).
- A typed view-props contract (`add-typed-view-props`).
- SSR / Declarative Shadow DOM hydration.
- Host→runtime veto / "negotiation" events.
- A typed interaction-type vocabulary (`add-interaction-type-vocabulary`).
- Any `@velkren/core` API change.

## Decisions

### 1. Runtime resolution: one host registration authorizes; placement is declarative

`defineVelkrenElement(tag, config)` registers, once, how a tag resolves its runtime
(a factory) plus its component, surface mode, and outward-event map. This mirrors
the platform's own `customElements.define` — one explicit act authorizes, then the
tag is declarative. Authority flows from the registration, never from the DOM.

- **Alternatives rejected**:
  - _Ancestor/DOM-context provider_ (most ergonomic): a child finds its runtime by
    walking up to the nearest provider. Rejected — it makes DOM ancestry determine
    scope/ownership, the exact thing the constitution forbids; wrapping the lookup
    in an event does not help, because _which_ provider answers is still positional.
  - _Default singleton runtime_: hidden ambient authority; breaks runtime
    independence. Rejected.
  - _Per-element property injection only_: fully explicit but collapses C1 back to
    per-element host JS, losing the declarative appeal. Kept as the _property-in_
    wiring channel, not as the primary resolution path.
- **The saving distinction**: a tag string may grant _construction_ of authority
  through the factory (always allowed — anyone may build a runtime) but never
  _ownership of an existing_ runtime (forbidden). The registry hands out recipes,
  not live shared runtimes keyed by string; any sharing is a host-written closure
  inside the factory.

### 2. Ownership by construction, not by refcount

The factory's return **kind** encodes the lifetime contract: return a _runtime_ →
ownership transfers to the membrane (ephemeral; state tied to DOM lifetime; membrane
disposes on release); return a _borrowed authority_ into a host-owned runtime → borrow (durable;
state outlives any element; membrane disposes only what it created). The
mode is really a statement about whether authoritative state's lifetime is anchored
to the DOM or to the app. In borrow mode the handed authority is either a scope that
explicitly carries component-creation authority or a projectable reference to a
host-created instance (the membrane then creates nothing) — a managed instance is
still created only through the owning runtime's typed factory (PROJECT.md
invariant), never conjured by mere possession of a scope.

- **Alternative rejected**: _refcount membranes, dispose the shared runtime at zero._
  Rejected on two independent grounds — (a) it makes runtime lifecycle a function of
  DOM connectedness (forbidden), and (b) the move footgun drops the count to zero
  during a reparent of the last membrane, destroying document state mid-drag. The
  trap is dissolved by never sharing _ownership_, only ever sharing via a host-owned
  runtime the host disposes explicitly.

### 3. Light DOM default; shadow DOM an explicit per-tag opt-in

This is the first C axis the constitution does not decide — style isolation is a
surface concern, and the surface is non-authoritative. Decide by ergonomics: default
to the mode whose failure is loud and fixable (light: styles leak — visible) over
the mode whose failures are silent (shadow: global CSS, cross-boundary ARIA, form
participation break quietly). Velkren already isolates via ownership, so shadow adds
only _style_ isolation. Turn shadow on for two cases: embedding into a foreign host
that needs style encapsulation, or (future) slotted nesting. The anchor (identity,
commit-repair, interaction listener) stays on the host element regardless; only
interior event capture differs (`event.target` in light vs `composedPath()` in
shadow). The container-anchor refactor (native listener on the container) already
de-risks shadow by not relying on document-level delegation.

### 4. Outward events are notifications, not negotiations

Boundary-public events are host-declared at registration and relayed to
`dispatchEvent`; the outward name is decoupled from the internal EventClass so
internal renames do not break the host contract. `detail` is the semantic event's
existing immutable snapshot (from `semantic-events`), forwarded verbatim and frozen
— so the outward leak (a live reference reaching host code) is prevented upstream by
construction; the only discipline is "add nothing that is not itself a snapshot."
Dispatched on the host element (light DOM) so bubbling is natural and `composed` is
moot. `cancelable: false`: a cancelable event whose `preventDefault` steered the
runtime would let a host DOM handler exercise authority over a runtime decision — the
inbound leak in disguise, with a synchronous-timing hazard. This is a deliberate
deviation from the common Web Component cancelable-event pattern, which assumes
element-as-authority. If host influence is ever needed, model it as two explicit
crossings (an out-notification plus a separate in-request the runtime arbitrates),
never `preventDefault`.

### 5. Placement of the membrane code

The membrane is adapter-side. Whether it ships in each adapter package or in a
shared `@velkren/element` helper consumed by both adapters is an implementation
decision for apply; either way `@velkren/core` is untouched. A base case (C2:
created already-wired) plus the C1 layer (factory resolution + deferred/async mount)
keeps the contract from simple to complex.

## Risks / Trade-offs

- **DOM move mistaken for teardown** → grace-window-deferred release; only a
  confirmed detach (window elapsed, no reconnect) releases.
- **Shadow DOM silent breakage** (global CSS not applying, ARIA/form participation
  across the boundary) → light DOM default; shadow is explicit opt-in with an
  explicit interior-styles channel.
- **Outward `detail` leaking a live reference** → structurally prevented by
  forwarding the semantic event's existing frozen snapshot and adding nothing
  non-snapshot; no ad-hoc "convenience handle."
- **Global custom-element tag namespace** → one tag maps to a generic membrane
  class; per-instance runtime wiring means N instances never collide. The single
  global registration is a boundary primitive, not app coordination.
- **Async runtime resolution** → `connectedCallback` only schedules mount; mount is
  deferred to a microtask/promise, consistent with "DOM signal is a request."
- **Host disposes a borrowed runtime under a live membrane** → membrane observes its
  root's managed status, reflects empty, and makes subsequent detach a no-op.

## Open Questions

- **Adapter capability impact**: does realizing the membrane require the Solid and
  React adapters to gain a mount-into-membrane-container (and shadow-root) capability
  that modifies their specs, or is it purely additive on the existing `RendererPort`?
  Resolve before apply; if it modifies adapter behavior, list `solid-adapter` and
  `react-adapter` as Modified Capabilities rather than claiming none.
- **First-increment sequencing**: consider landing the first membrane as the smallest
  verifiable slice — a light-DOM, ephemeral, notification-free membrane (registration
  - runtime resolution + inbound data/interaction + move-safe lifecycle + two-editor
    validation) — and deferring the shadow-DOM surface and the outward-event relay to
    immediately-following changes, to keep the first apply "larger than a checkbox,
    smaller than a whole feature." Decide split vs single change before apply.
- **Outward relay reuse (verify at apply)**: confirm the existing relayer/listener
  public contracts can deliver a semantic event's snapshot to an adapter-side
  `dispatchEvent` sink with no `@velkren/core` change; if not, the "core unchanged"
  claim must be revisited.
- **Attribute surface shape**: static `observedAttributes` for a fixed data surface,
  a single JSON-blob attribute for dynamic data, or dynamic data only via properties?
  (Collection-level; does not affect the invariants.)
- **Grace-window length / policy**: a microtask, a fixed timeout, or configurable per
  tag? What is the right default that survives a reparent but does not delay genuine
  release perceptibly?
- **Membrane home**: per-adapter vs a shared `@velkren/element` package.
- **Shadow mode default open vs closed**: `open` (debuggable/testable) proposed as
  default; `closed` for hardened embeds. Non-constitutional — authority is not in the
  DOM either way.
- **Outward event naming convention**: prefix/namespacing for dispatched events (e.g.
  `velkren:save`) to avoid collision with host/standard events — recommendation vs
  enforcement.
- **Pre-resolution fallback content**: whether/how the membrane shows host-authored
  fallback (light children / a slot) until the runtime resolves — foreshadows the
  deferred SSR path; keep the contract from foreclosing it.
