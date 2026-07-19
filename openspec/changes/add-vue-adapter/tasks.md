## 1. Package and dependency

- [ ] 1.1 Create the `@velkren/vue-adapter` package (package.json, tsconfig, src) depending on `@velkren/core`, `@velkren/element`, and `vue`
- [ ] 1.2 Add `@velkren/vue-adapter` to the root tsconfig references; inline `vue` in `vitest.config.ts`

## 2. Vue renderer

- [ ] 2.1 Implement `createVueRenderer` over `render`/`h`: `createRoot` (container + identity stamp), `commit` (patch + re-stamp), `readIdentity`, `removeRoot` (unmount + detach), `registerInteraction` (container native listener + registration map)
- [ ] 2.2 Add the per-root container anchor, commit repair, and `snapshotNativeEvent` (frozen `{ type, value }`), mirroring the React adapter
- [ ] 2.3 Implement the view registry (`kind` → Vue view) and the `simulateInteraction` / `elementForIdentity` affordances

## 3. Validations

- [ ] 3.1 Vue two-editor validation via `createEditorApp(createVueRenderer())`; fail on any Vue dev warning
- [ ] 3.2 Vue membrane wrapper `defineVelkrenElement` binding the shared core to `createVueRenderer`
- [ ] 3.3 Vue membrane validation: mount, isolate, capture an interaction, relay an outward event, and dispose through the boundary

## 4. Boundary guards

- [ ] 4.1 A boundary test asserting `@velkren/core` imports no Vue type and the dependency direction is one-way (adapter → core / element)

## 5. Definition of Done

- [ ] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root and address findings
- [ ] 5.2 Run an adversarial review of the apply output against the PROJECT.md invariants and this change's requirements before committing
