## Context

The membrane class lives in `@velkren/solid-adapter/src/index.ts`. It depends on the
renderer through one call — `createSolidRenderer({ container })` — and otherwise uses
only DOM globals (`HTMLElement`, `customElements`, `CustomEvent`, `queueMicrotask`) and
`@velkren/core` types. `@velkren/react-adapter` exposes `createReactRenderer` with the
same `{ container }` options shape. So the membrane is already renderer-agnostic; only
its packaging is Solid-specific.

## Goals / Non-Goals

**Goals:**

- A shared, renderer-agnostic membrane core both adapters use.
- The Solid refactor is behavior-preserving (existing validations pass unchanged).
- A React membrane that reproduces the guarantees on React.
- No `@velkren/core` change.

**Non-Goals:**

- A Vue membrane (awaits `add-vue-adapter`).
- Any change to the membrane's observable behavior.
- Inbound data crossings.

## Decisions

### 1. Extract a shared core rather than duplicate

`@velkren/element` holds the membrane class, parameterized by an injected renderer
factory: `defineMembraneElement(tag, config, createRenderer)`. `MembraneConfig<R>` and
`MembraneMountContext<R>` are generic over the concrete renderer type `R`, so an app
keeps its adapter's renderer type in the mount context.

- **Alternative rejected**: duplicate the membrane in the React adapter. The code is
  identical but for the renderer factory; duplication would drift and would not prove
  the membrane is renderer-agnostic. Extraction makes the agnosticism structural: the
  core imports no renderer at all.

### 2. Adapters provide a thin, named wrapper

Each adapter keeps its own `defineVelkrenElement(tag, config)` — a one-liner that calls
`defineMembraneElement(tag, config, createXRenderer)`. The adapter re-exports the
membrane types from `@velkren/element` so existing imports (`MembraneConfig`,
`MembraneMount`, `MembraneMountContext`) keep working. `createXRenderer` already accepts
`{ container }`, so it satisfies the injected `RendererFactory` directly.

### 3. Behavior-preserving Solid refactor

The membrane class, `dispatchBoundaryEvent`, the shadow logic, and the move-safe
lifecycle move verbatim into `@velkren/element`, with `createSolidRenderer` replaced by
the injected factory. The Solid adapter's `membrane.test.ts` and `durable.test.ts` are
the regression proof — they must pass unchanged.

### 4. Dependency direction stays one-way

`@velkren/element` depends on `@velkren/core` (types) only — not on Solid or React.
Each adapter depends on `@velkren/element` and `@velkren/core`. Core depends on nothing.
The existing boundary tests (core has no runtime deps) continue to hold, and a new
boundary check keeps `@velkren/element` free of any renderer dependency.

## Risks / Trade-offs

- **A hidden Solid coupling surfaces during extraction** → the regression suite
  (`membrane.test.ts`, `durable.test.ts`) runs on the refactored Solid adapter; a
  coupling would fail a test rather than ship silently.
- **Two packages now export `defineVelkrenElement`** → intentional; each is scoped to
  its adapter, and an app uses one. The generic `defineMembraneElement` is the shared
  form for advanced/custom renderers.
- **React's event/commit model differs** → the membrane only needs `{ container }` →
  `RendererPort`; React's specifics (flushSync, container-anchor listener) already live
  inside `createReactRenderer`, below the membrane.

## Open Questions

- **Package naming**: `@velkren/element` (chosen) vs `@velkren/membrane`. "element"
  reads as the custom-element surface; revisit if a broader element story emerges.
- **Whether `defineVelkrenElement` should be one exported name across adapters** or
  adapter-qualified; kept identical per adapter for now for symmetry.
