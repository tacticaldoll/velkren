## Why

Render-root projection gives every root a stable managed RootHandle, but nothing coordinates layout across roots. Layout needs those stable handles, yet it must stay independently replaceable from the renderer so a different layout strategy can be swapped without touching projection. This change adds a deterministic, synchronous, handle-only layout coordinator so layout order and timing are fixed and inspectable before a real renderer or advanced strategy exists.

## What Changes

- Add a runtime-owned layout coordinator that registers a synchronous layout contract for an owner-validated RootHandle and never accepts DOM nodes, elements, strings, or selectors.
- Add explicit invalidation that marks a registered handle dirty, and a layout pass that processes only invalidated handles in deterministic registration order.
- Add three ordered synchronous phases — measure, then calculate, then apply — each run across all invalidated handles before the next phase begins, with a per-handle scratch carrying values across phases.
- Reject asynchronous synchronous-phase hooks: a phase hook that returns a promise or thenable MUST fail explicitly.
- Keep layout independent of projection internals: bindings reference only RootHandles, and releasing a handle drops its layout binding.
- Keep advanced layout strategies, constraint solving, animation, asynchronous scheduling, and real measurement backends **out of scope**; they remain deferred in the backlog.

## Capabilities

### New Capabilities

- `layout-coordination`: handle-only layout registration, explicit invalidation, a deterministic synchronous measure/calculate/apply pass, synchronous-only phase enforcement, and independence from renderer projection — all framework-independent.

### Modified Capabilities

None. Layout consumes the existing RootHandle and ownership contracts without changing their externally observable requirements.

## Impact

- Extends the public `@velkren/core` API with the layout runtime, the layout contract and phase contracts, and layout-domain errors.
- Reuses the ownership and RootHandle contracts while keeping generic registries, factory kernels, and projection internals out of the public export map.
- Adds no DOM type, real measurement backend, scheduler, or asynchronous phase; the coordinator is synchronous and handle-only.
