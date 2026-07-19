## 1. Extract the shared membrane core

- [x] 1.1 Create the `@velkren/element` package (package.json, tsconfig, src) depending only on `@velkren/core`
- [x] 1.2 Move the membrane class, `dispatchBoundaryEvent`, shadow logic, and move-safe lifecycle into it, generic over the renderer type `R`
- [x] 1.3 Export `defineMembraneElement(tag, config, createRenderer)`, `MembraneConfig<R>`, `MembraneMount`, `MembraneMountContext<R>`, and the renderer-factory type

## 2. Refactor the Solid adapter onto the shared core

- [x] 2.1 Replace the Solid adapter's membrane class with a thin `defineVelkrenElement` that binds the core to `createSolidRenderer`
- [x] 2.2 Re-export the membrane types from `@velkren/element` so existing imports keep working
- [x] 2.3 Confirm `membrane.test.ts` and `durable.test.ts` pass unchanged (behavior-preserving)

## 3. Add the React membrane

- [x] 3.1 Add a `defineVelkrenElement` wrapper to `@velkren/react-adapter` binding the core to `createReactRenderer`; depend on `@velkren/element`
- [x] 3.2 Add a React membrane validation: mount a component, isolate two membranes, capture an interaction, relay an outward event, and dispose — through the element boundary on React

## 4. Boundary guards

- [x] 4.1 Add/extend a boundary test asserting `@velkren/element` imports no renderer (no Solid, no React) and only `@velkren/core`
- [x] 4.2 Verify `@velkren/core` and the `RendererPort` are unchanged

## 5. Definition of Done

- [x] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root and address findings
- [x] 5.2 Run an adversarial review of the apply output against the PROJECT.md invariants and this change's requirements before committing
