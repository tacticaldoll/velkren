## 1. Durable multi-view validation

- [ ] 1.1 Add a host-owned service fixture (`get`/`set`/`subscribe`) holding document state, owned by no runtime
- [ ] 1.2 Define an ephemeral membrane view whose factory mints a runtime, composes a component that reads the service and renders its value, subscribes for changes and re-commits on change, and unsubscribes + disposes on detach
- [ ] 1.3 Wire an interaction in a view to update the service (an edit)

## 2. Assert the durable guarantees

- [ ] 2.1 Two views share one service; an edit in one re-renders the other (cross-view sync via the service)
- [ ] 2.2 Detaching one view disposes only its runtime; the service and its state survive; the other view stays live
- [ ] 2.3 A newly attached view reads the current service state
- [ ] 2.4 A disposed view's subscription is removed and it receives no further updates

## 3. Documentation

- [ ] 3.1 Add `docs/durable-multi-view.md` recipe: host-owned service + ephemeral membrane views, cross-view sync, and why durability is an application-service concern

## 4. Core-neutrality guard

- [ ] 4.1 Verify no `@velkren/core`, `RendererPort`, or membrane change; the pattern is composition over the existing ephemeral membrane

## 5. Definition of Done

- [ ] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root and address findings
- [ ] 5.2 Run an adversarial review of the apply output against the PROJECT.md invariants and this change's requirements before committing
