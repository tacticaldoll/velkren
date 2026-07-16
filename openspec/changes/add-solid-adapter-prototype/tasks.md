## 1. Adapter Package and Environment

- [ ] 1.1 Add the `packages/solid-adapter` (`@velkren/solid-adapter`) package with a `solid-js` runtime dependency, a `@velkren/core` workspace dependency, and a TypeScript project reference.
- [ ] 1.2 Add a package-scoped browser-like test environment (DOM) and the SolidJS JSX/transform build step, leaving the core package's Node-only environment unchanged.
- [ ] 1.3 Add a test asserting `@velkren/core` builds and tests with no SolidJS, DOM, or reactive import and no dependency on the adapter (one-way direction).

## 2. Reactive RendererPort Implementation

- [ ] 2.1 Implement `createRoot`/`commit`/`readIdentity`/`removeRoot` building a DOM subtree from renderer-neutral render nodes with SolidJS reactivity for dynamic content.
- [ ] 2.2 Apply the runtime-assigned identity attribute at creation and re-apply it on commit, repairing external removal without deriving identity or ownership from the DOM.
- [ ] 2.3 Add browser-environment tests for mount projecting a plan with its identity attribute and commit repairing a removed identity attribute.

## 3. Boundary and Semantic Events

- [ ] 3.1 Implement the native input snapshot boundary capturing DOM input/events as immutable snapshots and never passing live DOM nodes or native event objects into the runtime.
- [ ] 3.2 Translate a configured native interaction into a framework-owned semantic event dispatched through core's event contracts.
- [ ] 3.3 Add tests that a native event yields only an immutable snapshot and that an interaction emits a runtime semantic event, not a renderer-native one.

## 4. Deterministic Disposal

- [ ] 4.1 Own a per-root disposal scope for SolidJS reactive effects and attached DOM listeners.
- [ ] 4.2 Implement idempotent `removeRoot` disposal that tears down every reactive effect and DOM listener with no leaks.
- [ ] 4.3 Add the end-to-end test: one component mounts, reacts, emits a semantic event, and unmounts leaving no reactive effect or DOM listener.

## 5. Verification

- [ ] 5.1 Run the adapter package's Definition of Done (build, browser-like test env, lint, format) and the core package's Node-only Definition of Done; run `openspec validate --all`; resolve every failure.
- [ ] 5.2 Perform adversarial review against project invariants, delta and living specs, the adopt-narrowly boundary (no SolidJS/DOM/reactive in core, one-way import), identity-from-DOM leakage, live-node/native-event crossing, effect/listener leaks on disposal, and the browser-only scope of the adapter test environment before sync and archive.
