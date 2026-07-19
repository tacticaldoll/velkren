## 1. Membrane registration and runtime resolution

- [x] 1.1 Add `defineVelkrenElement(tag, config)` in `@velkren/solid-adapter` binding a tag to a mount factory; one registration authorizes (`customElements.define`), placement is declarative
- [x] 1.2 Resolve each membrane's composition only from the registered factory; forbid ambient/DOM-ancestry/selector/default-singleton resolution
- [x] 1.3 Ensure a tag/attribute string yields at most construction through the factory, never an existing runtime's ownership, and the element exposes neither its runtime nor an owner-validated reference
- [x] 1.4 Support async/deferred mount: `connectedCallback` schedules mount rather than mounting synchronously; bind a `createSolidRenderer({ container: element })` renderer to the element

## 2. Ephemeral ownership and move-safe lifecycle

- [x] 2.1 Have the factory mint the composition (fresh runtime) per membrane; the membrane owns it and creates managed instances only through the owning runtime's factory
- [x] 2.2 Dispose the minted composition on confirmed detach via the factory-returned handle; cascade cleanup, surface (never swallow) failures; no refcounting
- [x] 2.3 Implement move-safe detach: grace-window-deferred release; reconnect within the window preserves projection/identity/state; beyond it, reconnect is a new projection; make the window→release transition atomic w.r.t. reconnection and release idempotent (no double release, no reattach to a released root)

## 3. Reused anchor and surface

- [x] 3.1 Make the membrane the per-root container so interactions bubble to the container listener and deliver snapshots through the port (light DOM: native event target)
- [x] 3.2 Project into light DOM; keep the repairable identity attribute and interaction container listener on the per-root container within the element

## 4. Core-neutrality guard

- [x] 4.1 Verify no DOM/`CustomEvent`/host type enters `@velkren/core` and core marks no event boundary-public; the membrane lives only in the adapter layer

## 5. Validation

- [x] 5.1 Add a membrane two-editor validation reproducing isolation, business-event emission (observed through the event trace), and scope-local disposal through the element boundary, with no `@velkren/core` change
- [x] 5.2 Prove two membranes on one page do not collide through the shared global tag and runtime independence holds
- [x] 5.3 Cover the move-safe reconnect (a move preserves the projection; a confirmed detach disposes)

## 6. Definition of Done

- [x] 6.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root and address findings
- [x] 6.2 Run an adversarial review of the apply output against the PROJECT.md invariants and this change's requirements before committing
