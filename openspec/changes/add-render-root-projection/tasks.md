## 1. Port Contract and Domain Types

- [ ] 1.1 Add the `RendererPort` contract (create root, commit, read identity, remove root) trading only in renderer-neutral render nodes and identity tokens, plus RootHandle, projection identity, and projection-domain error types.
- [ ] 1.2 Add projection identity allocation that qualifies each root by instance and root name independently of the render plan.
- [ ] 1.3 Add tests that the port and types compile and are usable with only renderer-neutral values and no DOM/renderer imports.

## 2. Managed RootHandle Projection

- [ ] 2.1 Implement `createProjectionRuntime(runtime, renderer)` with port conformance validation and explicit rejection of a non-conforming renderer.
- [ ] 2.2 Implement mounting a resolved render plan into one owner-validated managed RootHandle per named root, rejecting foreign instances before any port call and releasing already-created roots on partial failure.
- [ ] 2.3 Implement idempotent RootHandle release that removes its root through the port, plus projection release that removes every owned root in reverse order.
- [ ] 2.4 Add tests for multi-root mount, foreign-instance rejection, single-root release, and idempotent repeated release.

## 3. Identity and Commit Repair

- [ ] 3.1 Write the permanent runtime-assigned identity token to the surface at creation and pass it on every commit, keeping it stable and plan-independent.
- [ ] 3.2 Implement commit with mandatory identity re-application and repair when the surface attribute was removed or altered, preserving the runtime-assigned token.
- [ ] 3.3 Add tests for stable identity across commits, distinct per-root identity, content update with preserved identity, and repair of a removed identity attribute.

## 4. Ownership Independence and Fake Renderer

- [ ] 4.1 Enforce that identity tokens, surface attributes, strings, and selectors never grant a RootHandle, and reject foreign or imitation RootHandles before any port call.
- [ ] 4.2 Implement the framework-owned in-memory fake renderer building an inspectable node tree with per-root identity attributes and read access, with no browser globals.
- [ ] 4.3 Add tests for foreign/imitation RootHandle rejection, surface-attribute-does-not-grant-authority, and fake-renderer inspection of tree and identity in Node.js.

## 5. Public Facade and Verification

- [ ] 5.1 Compose the projection facade into the public API with frozen delegates for creating a projection runtime, mounting, committing, and releasing, without changing existing component/template/event/listener/plugin behavior.
- [ ] 5.2 Add intentional public exports for the RendererPort contract, projection runtime, RootHandle, projection identity, fake renderer, and projection errors while proving generic registries, factory kernels, projection internals, and deferred real-renderer/layout/reactive APIs remain unavailable.
- [ ] 5.3 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, and `openspec validate --all`; resolve every failure.
- [ ] 5.4 Perform adversarial review against project invariants, delta and living specs, surface-as-source-of-truth, ownership forgery, foreign instance/handle rejection, identity stability and repair, partial-mount rollback, renderer-type leakage, public exports, and Node.js isolation before sync and archive.
