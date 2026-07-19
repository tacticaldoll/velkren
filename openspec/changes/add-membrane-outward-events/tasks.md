## 1. Dispatch helper on the mount context

- [ ] 1.1 Add `dispatchBoundaryEvent(name: string, detail: JsonObject): void` to `MembraneMountContext` in `@velkren/solid-adapter`
- [ ] 1.2 Implement it to dispatch a `CustomEvent` on the host element with `bubbles: true`, `cancelable: false`, and a frozen `detail`
- [ ] 1.3 Ensure the helper adds nothing that is not itself a snapshot and never places a live reference in `detail`

## 2. Core-neutrality guard

- [ ] 2.1 Verify the relay mechanism and mapping live only in the adapter/membrane and host factory; `@velkren/core` gains no `CustomEvent` type and marks no event boundary-public

## 3. Validation

- [ ] 3.1 Extend the membrane validation: wire `dispatchBoundaryEvent` from the editor's event trace so a completed business event dispatches a host-facing `CustomEvent`; a host `addEventListener` receives it with a frozen snapshot `detail`
- [ ] 3.2 Assert the outward event bubbles, reports `cancelable` false, and that `preventDefault` does not affect the runtime
- [ ] 3.3 Assert the outward name is the host-chosen string, independent of the internal EventClass id

## 4. Definition of Done

- [ ] 4.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root and address findings
- [ ] 4.2 Run an adversarial review of the apply output against the PROJECT.md invariants and this change's requirements before committing
