## 1. Config and context surface

- [ ] 1.1 Add `observedAttributes?: readonly string[]` and
      `dataProperties?: readonly string[]` to `MembraneConfig<R>` in
      `packages/element/src/index.ts`
- [ ] 1.2 Add `onAttributeChange(name, handler): () => void` and
      `onPropertyAssign(name, handler): () => void` to
      `MembraneMountContext<R>`

## 2. Attribute crossing

- [ ] 2.1 Add `static get observedAttributes()` to the shared
      `VelkrenMembraneElement` base class, reading from the per-tag config
- [ ] 2.2 Add a per-instance `#attributeValues: Map<string, string | null>`
      and implement `attributeChangedCallback(name, oldValue, newValue)`,
      updating the map and dispatching to any registered handler
- [ ] 2.3 Add a per-instance `#attributeHandlers: Map<string, Set<handler>>`
      and wire `onAttributeChange` to register into it, immediately invoking
      the handler with the current buffered value (or `null`)

## 3. Data-property crossing

- [ ] 3.1 In the membrane element's constructor, define an accessor
      (`Object.defineProperty`) for each name in `config.dataProperties`,
      backed by a per-instance `#propertyValues: Map<string, unknown>`
- [ ] 3.2 Add a per-instance `#propertyHandlers: Map<string, Set<handler>>`
      and wire `onPropertyAssign` to register into it, immediately invoking
      the handler with the current buffered value

## 4. Failure containment and mount-scoping

- [ ] 4.1 Wrap every handler invocation (attribute and property) in a
      try/catch that reports a throw through the existing
      `reportMembraneError`, never letting it propagate out of
      `attributeChangedCallback` or a property setter
- [ ] 4.2 Reset `#attributeHandlers`/`#propertyHandlers` to empty at the
      start of every fresh mount (alongside the existing `#generation` bump
      in `connectedCallback`'s fresh-mount branch); confirm a move
      (disconnect+reconnect within the grace window) does not reset them,
      since that branch is skipped when `#mount !== undefined`
- [ ] 4.3 Confirm `#attributeValues`/`#propertyValues` are NOT reset across a
      new mount (a fresh mount's first handler registration should see the
      element's current value, not `null`/`undefined`)

## 5. Tests (one per adapter, same harness pattern as existing membrane tests)

- [ ] 5.1 `packages/solid-adapter/test/membrane.test.ts`: extend the editor
      membrane fixture with a declared observed attribute and data property
      driving a `StateHandle` bound via `state-binding`; assert the
      projected DOM reflects the initial value, a later `setAttribute`
      change, and a later property assignment
- [ ] 5.2 `packages/react-adapter/test/react-membrane.test.ts`: same test,
      React renderer
- [ ] 5.3 `packages/vue-adapter/test/vue-membrane.test.ts`: same test, Vue
      renderer
- [ ] 5.4 In one of the three (no need to triplicate), add a test that
      assigning invalid (non-strict-JSON) data to a declared data property
      is caught and reported through the failure channel rather than
      thrown, and does not corrupt the bound state
- [ ] 5.5 In one of the three, add a test that a pre-mount attribute value
      (set before `place()`/append) and a pre-mount property assignment
      (set on the element before it is appended) both reach the bound state
      once mounted

## 6. Verification

- [ ] 6.1 Run `npm run build`, `npm test`, `npm run lint`,
      `npm run format:check` and confirm all four pass
- [ ] 6.2 Grep for any adapter-package source change needed beyond the test
      files (expect none — `@velkren/element`'s change should be sufficient
      for all three adapters unchanged)
