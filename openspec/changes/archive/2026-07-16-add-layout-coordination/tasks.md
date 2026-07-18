## 1. Layout Contracts and Domain Types

- [x] 1.1 Add the layout phase enum, the layout contract (synchronous measure/calculate/apply hooks), the per-handle phase-context type, and layout-domain error types.
- [x] 1.2 Add the layout runtime shell (`createLayoutRuntime(runtime)`), one coordinator per runtime.
- [x] 1.3 Add tests that the layout types compile and are usable with only RootHandles and no DOM/projection imports.

## 2. Handle-Only Registration

- [x] 2.1 Implement `register(handle, contract)` validating same-runtime ownership and active status and rejecting foreign handles, released handles, imitations, and non-handle values.
- [x] 2.2 Enforce at most one active layout contract per RootHandle and record bindings in deterministic registration order.
- [x] 2.3 Add tests for successful registration, foreign/non-handle rejection, and duplicate-contract rejection.

## 3. Invalidation and Deterministic Passes

- [x] 3.1 Implement `invalidate(handle)` marking a registered active handle dirty and failing explicitly for unregistered or released handles.
- [x] 3.2 Implement `flush()` running batched measure, then calculate, then apply across only dirty handles in registration order, with a per-handle scratch carried across phases, and clearing dirty state on completion.
- [x] 3.3 Add tests for phase ordering across handles, scratch propagation, processing only invalidated handles, and dirty-state clearing.

## 4. Synchronous Enforcement and Handle Lifetime

- [x] 4.1 Enforce synchronous phase hooks by failing the pass explicitly when a hook returns a promise or thenable, running no later phase for that handle.
- [x] 4.2 Drop a handle's layout binding when the RootHandle is released so a released handle is neither processed nor needs manual deregistration.
- [x] 4.3 Add tests for async-hook rejection, synchronous completion, and released-handle binding cleanup during a pass.

## 5. Public Facade and Verification

- [x] 5.1 Compose the layout facade into the public API with frozen delegates for creating a layout runtime, registering, invalidating, and flushing, without changing existing projection/component/template/event/listener/plugin behavior.
- [x] 5.2 Add intentional public exports for the layout runtime, layout contract and phase-context types, the layout phase enum, and layout errors while proving generic registries, factory kernels, projection internals, and deferred strategy/scheduler APIs remain unavailable.
- [x] 5.3 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, and `openspec validate --all`; resolve every failure.
- [x] 5.4 Perform adversarial review against project invariants, delta and living specs, handle-only enforcement, ownership forgery, phase ordering and batching, per-handle scratch isolation, async-hook rejection, released-handle cleanup, surface independence, public exports, and Node.js isolation before sync and archive.
