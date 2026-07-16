## Context

Render-root projection produces stable managed RootHandles whose identity lives in the runtime, not the surface. Layout is the next coordination concern: it must position roots deterministically, but the constitutional invariants require it to stay framework-independent and to remain replaceable independently of the renderer. Layout therefore operates on RootHandles alone — never DOM nodes or the projected surface — and runs in fixed synchronous phases so its order and timing are inspectable before any real renderer or advanced strategy exists.

This change adds a runtime-owned layout coordinator: handle-only registration, explicit invalidation, and a deterministic measure → calculate → apply pass with synchronous-only hooks. Advanced strategies, constraint solving, animation, and asynchronous scheduling are deferred.

## Goals / Non-Goals

**Goals:**

- A runtime-owned layout coordinator that binds a synchronous layout contract to an owner-validated RootHandle.
- Explicit invalidation and a pass that processes only dirty handles in deterministic registration order.
- Three ordered synchronous phases (measure, calculate, apply), batched across handles, with per-handle scratch carried across phases.
- Explicit rejection of asynchronous phase hooks.
- Independence from projection: bindings reference only RootHandles, and a released handle drops its binding.

**Non-Goals:**

- Advanced layout strategies, constraint/flex solvers, or animation.
- Asynchronous scheduling, batching across microtasks, or frame timing.
- Real measurement backends, DOM geometry, or reading the projected surface.
- Cross-runtime layout or shared layout state.

## Decisions

### Bind layout contracts to RootHandles, not surfaces

`createLayoutRuntime(runtime)` creates one layout coordinator per Runtime. `register(handle, contract)` validates same-runtime ownership and active status of the RootHandle, rejects non-handles (strings, selectors, DOM nodes, imitations), and records at most one contract per handle. The contract is `{ measure, calculate, apply }`, each a synchronous hook. Because bindings reference only RootHandles, a different renderer or layout strategy can be swapped without touching projection.

Alternative considered: attach layout to the renderer surface or DOM node. Rejected — it would make the surface authoritative and couple layout to a specific renderer, violating both the one-way-projection and framework-independence invariants.

### Run batched, ordered, synchronous phases

A pass runs `measure` for every dirty handle, then `calculate` for every dirty handle, then `apply` — never interleaving phases. Within each phase, handles are visited in registration order, which makes passes deterministic. A per-handle scratch object created at pass start is passed to all three phases so measure can stash values that calculate and apply read. Batching phases (rather than running measure→calculate→apply per handle) matches how real layout separates reading from writing and keeps the order inspectable.

Alternative considered: run all three phases per handle before the next handle. Rejected — it prevents a later strategy from reading all measurements before calculating and blurs the read/write phase separation.

### Enforce synchronous hooks explicitly

After invoking each hook, the coordinator checks whether the return value is a thenable; if so it throws a layout phase error naming the phase and handle, and runs no later phase for that handle. The hook types return `void`, but the runtime guard makes the synchronous contract enforced rather than merely documented, satisfying "rejects asynchronous synchronous-phase hooks."

### Drive passes by explicit invalidation

`invalidate(handle)` marks a registered, active handle dirty; invalidating an unregistered or released handle fails explicitly. `flush()` processes exactly the currently dirty handles and clears their dirty state when done, so an un-invalidated handle is never processed. Invalidation is explicit rather than automatic because automatic tracking would require reactive primitives, which the core forbids.

### Tie binding lifetime to the RootHandle

When a RootHandle is released, its layout binding is dropped so a released handle is neither processed nor needs manual deregistration. The coordinator registers a release hook on the handle (through the managed-lifecycle cleanup contract) or checks handle status at pass time and prunes released bindings. Ownership is validated on every operation, so a foreign or imitation handle is rejected before any binding or pass work.

## Risks / Trade-offs

- **An async hook could silently defer layout** → Guard every hook's return value and fail the pass explicitly on a thenable.
- **Interleaved phases would break read/write separation** → Batch each phase across all dirty handles before advancing.
- **Non-deterministic ordering** → Visit handles in registration order every pass.
- **A released handle lingering in the dirty set** → Prune bindings on handle release and skip non-active handles during a pass.
- **Layout reaching into the surface** → Contracts receive only handle-scoped context; the coordinator never exposes or reads the projected surface.

## Migration Plan

1. Add the layout runtime, contract and phase-context types, the layout phase enum, and layout-domain errors without changing existing domains.
2. Add handle-only registration with ownership and non-handle rejection and one-contract-per-handle enforcement.
3. Add invalidation and the deterministic batched measure/calculate/apply pass with per-handle scratch.
4. Add synchronous-hook enforcement and released-handle binding cleanup.
5. Expose the layout facade publicly and prove no projection internal or DOM type is exported.
6. Run the full existing suites to prove projection, component, template, event, listener, and plugin behavior is unchanged.

Rollback removes the layout facade; all prior domains remain source-compatible because layout only consumes RootHandles.

## Open Questions

- Whether passes should later batch across an asynchronous scheduler or animation frame; deferred until a real renderer defines its timing needs.
- Whether calculate should return a typed layout result shared with the renderer's commit; deferred until the SolidJS adapter defines that contract.
