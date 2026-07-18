## Context

`RendererPort` today is asymmetric. Its four operations — `createRoot`,
`commit`, `readIdentity`, `removeRoot` — carry render nodes _outward_ to any
framework, and SolidJS types stay sealed inside the adapter. But nothing carries
interactions _inward_. The only working path from a user interaction to a
semantic event is in the two-editor fixture, which reaches past the port:

```
element = renderer.container.querySelector(`[data-velkren-root="${id}"]`)
element.addEventListener("click", () => events.dispatch(submitted.id, ...))
```

This is DOM-selector coordination the constitution forbids, and it only works
because SolidJS renders real DOM that an outsider can listen to. A framework
whose managed tree cannot be listened to from outside (React attaches handlers
during render; you cannot idiomatically `addEventListener` onto its tree) would
have no path at all. The renderer-independence promise is therefore only
half-proven. This change makes the port symmetric so that "one runtime, one
framework, any framework" holds for the input side too.

The key insight from exploration: **the adapter must capture interactions its
own idiomatic way, and core must only ever see an immutable snapshot.** That
forces a _declarative_ registration (core declares interest; the adapter decides
how to wire it) rather than an _imperative_ "here is the element, attach a
listener yourself."

## Goals / Non-Goals

**Goals:**

- Add a declarative interaction-registration operation to `RendererPort` that an
  imperative (Solid) _and_ a declarative (React/Vue) adapter can both satisfy.
- Own the immutable-snapshot boundary in core: only frozen JSON crosses inward.
- Add an interaction-binding contract mapping `(root, interaction-type)` to an
  `EventClass` + payload projection, dispatching through existing event
  contracts.
- Bind interaction registrations to the managed root lifecycle: released roots
  drop registrations; a binding survives a same-root commit (re-template), and a
  freshly projected root can be bound anew.
- Prove neutrality of the input side at the _core_ boundary using the Node-only
  fake renderer, and remove the two-editor DOM-selector bypass.

**Non-Goals:**

- No second concrete framework adapter (React/Vue) in this change — the fake
  renderer proves core neutrality; a real second adapter is a follow-up.
- No mixed-framework tree, no per-component renderer resolution.
- No plugin-based renderer selection — constructor injection
  (`createProjectionRuntime(runtime, renderer)`) stays.
- No interaction-type vocabulary normalization scheme beyond passing an opaque
  interaction-type string; adapters may translate names internally.

## Decisions

### D1: Declarative registration on the port, not imperative element handoff

`RendererPort` gains:

```
registerInteraction(
  root: AdapterRoot,
  type: string,
  deliver: (snapshot: JsonObject) => void,
): InteractionRegistration   // { remove(): void }
```

Core calls this; the adapter wires capture however its framework prefers and
calls `deliver` with a frozen snapshot when the interaction fires. **Why over
imperative** (`bindInteraction` exposing the element / returning a node): an
element handoff assumes an outside-attachable tree, which React does not have.
Declaring interest and letting the adapter own the wiring is the only shape both
an imperative and a declarative renderer can implement. This is the crux of the
whole change.

Alternative considered — keep the current `SolidRenderer.bindInteraction` and
just move it onto the base port unchanged. Rejected: its signature is still
"attach to this root now," which the Solid adapter happens to satisfy but is not
guaranteed for a reconciler-based adapter; and it lets the snapshot boundary
live in the adapter rather than core.

### D2: Core owns and freezes the snapshot

The adapter produces snapshot _data_, but core freezes it at the boundary before
any runtime code sees it, so no adapter can accidentally leak a live reference.
`deliver` treats its argument as untrusted: it deep-freezes (or rejects
non-JSON) before handing it to the binding. **Why**: the constitution's
"only immutable snapshot data crosses inward" is a runtime-boundary guarantee,
not an adapter courtesy; core must enforce it.

### D3: Interaction-binding is a separate core domain, not part of the port

A new module (`interaction-binding.ts`) owns the `(root, type) → EventClass +
project(snapshot)` map and the dispatch. The port stays a pure transport; it
knows nothing about `EventClass`. **Why over folding dispatch into the port**:
the mapping is application/template policy, and the port must remain a thin,
framework-facing transport with no event-domain knowledge. This keeps the port
implementable by an adapter author who never touches the event system.

Flow:

```
adapter capture ─deliver(snapshot)─▶ InteractionBinding
                                        │  look up (root,type) → {eventClass, project}
                                        │  payload = project(snapshot)
                                        ▼
                                     events.dispatch(eventClass.id, payload)
```

### D4: Registrations are owned by the managed root

`ProjectionRuntime.#createRoot` creates a `ManagedObjectController` and attaches
cleanups to it, but today that controller is a local that is discarded after
creation — `rootStates` keeps only `{port, adapterRoot, identity, rootName}`, so
there is no post-creation path to add a cleanup to an existing root. This change
therefore **retains an `addCleanup` capability in `RootState`** (the controller,
or a bound `addCleanup` function) and exposes a controlled ProjectionRuntime
accessor the binding domain uses to register interest and attach
`registration.remove()` to that root's cleanup. When the `RootHandle` releases,
`registration.remove()` runs and the binding entry is dropped. **Why**: reuses
the proven managed-cleanup path; no new lifecycle concept.

Note the deliberate coupling this creates with D3: interaction-binding is a
separate domain but necessarily depends on ProjectionRuntime to reach a root's
adapter root and cleanup. That dependency is made explicit through the accessor
rather than by leaking `rootStates`.

Re-template does **not** recreate the root: `retemplate` calls
`projection.commit(root, next)`, which reuses the same adapter root and only
updates content, so a root-level interaction registration survives a template
swap untouched with no re-registration. (Re-registering a binding against a
_freshly projected_ root is still supported as a general capability, and is
exercised at the core level with the fake renderer, but it is not part of the
commit-based re-template path.)

Because dispatch is asynchronous, "release stops delivery" is enforced two ways:
`registration.remove()` unwires the adapter capture, and the binding domain also
re-checks the binding is still live at `deliver` time before projecting and
dispatching, so an in-flight delivery that races release dispatches nothing.

### D5: Binding validates ownership and payload up front

`bind(root, type, eventClass, project)` calls `runtime.assertOwns(root)` before
touching the port (mirrors `projection.commit`). At dispatch, the projected
payload flows through the EventClass's existing closed-schema validation, so a
bad projection fails loudly rather than dispatching a malformed event.

## Risks / Trade-offs

- **[Port BREAKING change]** Every `RendererPort` implementation must add
  `registerInteraction`, and `assertRendererPort` will reject those that don't.
  → Only two implementations exist in-repo (Solid, fake); both are updated in
  this change. External implementers are none.
- **[Snapshot deep-freeze cost]** Freezing every delivered snapshot adds work on
  the interaction path. → Snapshots are small, shallow JSON (current one is
  `{type, value}`); freeze cost is negligible versus event dispatch.
- **[Neutrality proven only by a fake]** Using the fake renderer to prove input
  neutrality does not exercise a real reconciler-based framework. → Accepted and
  explicit: the fake proves _core_ imports nothing renderer-specific; the design
  (D1 declarative registration) is chosen precisely so a reconciler adapter can
  satisfy it, and a real React/Vue adapter is a deferred follow-up that will
  stress-test the shape.
- **[Interaction-type strings are opaque]** No shared vocabulary means two
  adapters could name the same interaction differently. → Out of scope; the
  string is passed through unchanged and can gain a vocabulary later without a
  port change.

## Migration Plan

In-repo only; no released consumers. Order matches tasks:

1. Extend the port contract + `assertRendererPort`; update the fake renderer
   (with an interaction-simulation helper) — core stays green in Node.
2. Add the interaction-binding module and wire registration cleanup into the
   projection root lifecycle; export from `@velkren/core`.
3. Update the Solid adapter to implement `registerInteraction` via its own event
   layer; drop any external-listener assumption.
4. Rewrite the two-editor fixture to bind through the contract and delete the
   `querySelector` + `addEventListener` path.
5. Run the full root Definition of Done.

Rollback is a straight revert; no data or persisted state is involved.

## Open Questions

- Should the interaction-type string eventually be a registered, typed
  vocabulary (like EventClass) rather than a free string? Deferred; not needed to
  prove neutrality.
- Should interaction-binding live in the same public export group as the port or
  as its own capability surface? Leaning: its own named export group
  (`interaction-binding`) to keep the port transport-only.
