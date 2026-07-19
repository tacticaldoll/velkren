## 1. InteractionType definition

- [ ] 1.1 Add `createInteractionType(slug, native)` and `isInteractionType` in `@velkren/core` (id via `createCanonicalClassId("interaction", …)`, frozen, WeakSet-tracked), mirroring `EventClass`
- [ ] 1.2 Export them and their types from the core public entry

## 2. Registry and bind

- [ ] 2.1 Add `registerInteractionType` to the interaction-binding domain; reject a duplicate local slug (`DuplicateInteractionTypeError`)
- [ ] 2.2 Widen `bind` to accept `InteractionType | string`; for an `InteractionType`, fail if unregistered (`InteractionTypeNotRegisteredError`) and resolve `native`; for a string, behave as before
- [ ] 2.3 Keep the `RendererPort` and every adapter unchanged (native string resolved core-side); export the new errors

## 3. Migration and tests

- [ ] 3.1 Migrate the shared two-editor composition to register and bind a `InteractionType`
- [ ] 3.2 Add core tests: a registered type resolves to native and delivers; an unregistered type is rejected; a duplicate slug is rejected; the raw-string path is unchanged

## 4. Definition of Done

- [ ] 4.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root and address findings
- [ ] 4.2 Run an adversarial review of the apply output against the PROJECT.md invariants and this change's requirements before committing
