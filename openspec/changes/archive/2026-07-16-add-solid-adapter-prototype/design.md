## Context

Velkren's runtime is framework-independent through layout coordination, verified only against an in-memory fake renderer implementing `RendererPort`. This change adds the first concrete renderer to prove the port boundary is sufficient and that core semantics stay renderer-independent under a real reactive framework.

A dependency assessment returned **adopt narrowly**: SolidJS's reactive mechanism directly contradicts core invariants (PROJECT.md: no renderer/reactive types in core contracts; no renderer-native reactive objects as the public model), so it may live only inside a new adapter package behind `RendererPort`. The core package keeps its zero-runtime-dependency, Node-only property unchanged. This is consumer #2 of `RendererPort`, which validates the port was not shaped to the fake renderer alone.

## Goals / Non-Goals

**Goals:**

- A new `@velkren/solid-adapter` package implementing `RendererPort` with SolidJS, depending on `@velkren/core` only through its public API.
- Reactive mount/commit/unmount driven entirely through the port, applying and repairing the runtime-assigned identity attribute.
- A native input snapshot boundary: only immutable snapshots and runtime semantic events cross into the runtime.
- Deterministic disposal of every SolidJS effect and DOM listener on unmount.
- A package-scoped browser-like test environment proving the mount → react → emit → unmount lifecycle.
- Core untouched: no SolidJS/DOM/reactive dependency and no adapter import in `@velkren/core`.

**Non-Goals:**

- Reusable UI component breadth, real application components, or a design system.
- Server rendering, hydration, streaming, or SSR.
- Any change to core contracts, or exposing SolidJS reactivity as a public runtime model.
- A production-grade renderer; this is a prototype proving the boundary.

## Decisions

### Put SolidJS in a new package, never in core

Add `packages/solid-adapter` (`@velkren/solid-adapter`) with `solid-js` as a runtime dependency and `@velkren/core` as a peer/workspace dependency. Dependency direction is one-way: adapter → core, enforced by import structure and an explicit test that core builds and tests with no SolidJS/DOM import. This is the concrete form of the adopt-narrowly boundary; the `RendererPort` from render-root projection is the only seam.

Alternative considered: add a `solid` entry point inside `@velkren/core`. Rejected — it would put reactive/renderer types in core, violating the framework-independence invariant the assessment flagged as disqualifying.

### Drive rendering only through RendererPort

The adapter implements `createRoot(identity, node)`, `commit(root, identity, node)`, `readIdentity(root)`, and `removeRoot(root)`. `createRoot` builds a DOM subtree from the renderer-neutral `RenderNode`, sets the identity attribute (`PROJECTION_IDENTITY_ATTRIBUTE`), and wires SolidJS reactivity for dynamic content. `commit` re-applies identity (repairing external removal) and updates content. Identity and ownership are never read back from the DOM — the surface stays a one-way projection.

### Keep the runtime boundary snapshot-only

Native input and DOM events are captured at the adapter edge and converted to immutable snapshots (reusing core's strict-JSON snapshot discipline) before anything crosses into the runtime. The adapter translates configured interactions into framework-owned semantic events dispatched through the runtime's event contracts. No live DOM node, native `Event`, or SolidJS signal is passed inward, preserving "runtime state is authoritative; the DOM is a projection."

### Dispose deterministically

Each mounted root owns its SolidJS reactive root (`createRoot`/`getOwner` disposal scope) and the set of DOM listeners it attached. `removeRoot` disposes the reactive scope and detaches every listener, and is idempotent. The end-to-end test asserts that after unmount no effect re-runs and no listener remains, satisfying the backlog acceptance ("mounts, reacts, emits a semantic event, and unmounts without leaving listeners or reactive effects").

### Test in a package-scoped browser-like environment

The adapter package gets its own Vitest config with a DOM environment (jsdom or happy-dom) and a SolidJS JSX/transform step. This environment is scoped to the adapter package only; `packages/core` keeps its Node-only environment untouched. The root Definition of Done continues to run per workspace.

## Risks / Trade-offs

- **SolidJS leaking into core** → One-way import structure plus an explicit test that core builds/tests without SolidJS or DOM; the port is the only seam.
- **Live DOM or native events crossing inward** → Snapshot at the boundary; pass only immutable data and semantic events into the runtime.
- **Leaked effects or listeners on unmount** → Own a disposal scope per root; dispose reactivity and detach listeners in `removeRoot`; assert none remain.
- **Toolchain expansion (JSX transform, browser env)** → Scope it to the adapter package; keep core's build and Node test env unchanged.
- **Identity derived from the DOM** → Apply identity from the port's token only; never read authority from surface attributes.

## Migration Plan

1. Add the `packages/solid-adapter` package skeleton, its `solid-js` dependency, JSX/transform build, and a package-scoped DOM test environment.
2. Implement the `RendererPort` with reactive mount/commit and identity application/repair.
3. Add the native input snapshot boundary and semantic-event emission through core's event contracts.
4. Add deterministic per-root disposal of reactive scopes and DOM listeners.
5. Add the browser-like end-to-end test (mount → react → emit → unmount) plus a test asserting core stays SolidJS/DOM-free.
6. Run each package's Definition of Done; confirm core's Node-only suite is unchanged.

Rollback deletes the `packages/solid-adapter` package; core and all prior domains are unaffected because nothing depends on the adapter.

## Open Questions

- jsdom vs. happy-dom vs. Vitest browser mode for the adapter's DOM environment — an implementation-time choice made when the package is built.
- The exact JSX/transform toolchain (vite-plugin-solid / babel-preset-solid) that coexists with the repo's `tsc -b` build — resolved during apply.
- Whether the input snapshot boundary should reuse core's `createJsonSnapshot` directly or a thin adapter-local wrapper — decided during implementation.
