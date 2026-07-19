## Context

The `RendererPort` is implemented by the Solid adapter (imperative signals) and the
React adapter (`react-dom/client` + `flushSync`). Vue is a third rendering model. Vue 3
exposes a low-level imperative renderer — `render(vnode, container)` mounts/patches
synchronously and `render(null, container)` unmounts — plus `h(type, props, children)`
for vnodes. That is exactly the imperative surface the port needs.

## Goals / Non-Goals

**Goals:**

- A Vue `RendererPort` that satisfies the contract and passes the shared two-editor
  validation.
- The same per-root container anchor (identity + native interaction listener) and
  commit repair as the other adapters.
- A Vue membrane via the shared `@velkren/element` core.
- No `@velkren/core` change.

**Non-Goals:**

- Mixed-framework trees.
- A Vue-idiomatic reactive-props view path beyond the validation set.
- Server rendering.

## Decisions

### 1. Drive Vue through its low-level imperative renderer

Use `render` and `h` from `vue`. `createRoot` builds a container, calls
`render(buildVNode(node), container)`, and stamps identity. `commit` calls
`render(buildVNode(node), container)` again — Vue patches the existing tree
synchronously, so the port's read-after-return contract holds without an explicit
flush. `removeRoot` calls `render(null, container)` to unmount, then removes listeners
and the container.

- **Alternative rejected**: `createApp().mount()`. The full app runtime adds context
  and lifecycle the port does not need; the bare `render` is the custom-renderer surface
  Vue provides for exactly this.

### 2. The container anchor, identical to the other adapters

Identity is stamped imperatively on the per-root container (never a vnode prop), so a
commit repairs an out-of-band-removed attribute — the container is the render target,
not part of the vnode tree. Interaction capture is one native listener per type on the
container, reading a registration map at event time, so registration needs no
re-render. This mirrors the React adapter's container-anchor exactly.

### 3. Snapshot at the boundary; Vue types stay in the package

`snapshotNativeEvent` captures only `{ type, value }` as a frozen snapshot — no live
node or native event crosses inward, identical to Solid and React. `@velkren/core`
imports no Vue type; Vue lives only in `@velkren/vue-adapter`.

### 4. The membrane is a thin wrapper over the shared core

`defineVelkrenElement(tag, config)` calls `defineMembraneElement(tag, config,
createVueRenderer)`. Nothing membrane-specific is re-implemented; the Vue membrane is
the shared core bound to the Vue renderer, and the Vue membrane validation reproduces
the guarantees.

## Risks / Trade-offs

- **Vue dev warnings during validation** → the two-editor test fails on any
  `console.warn`/`console.error`, as the React validation does, so a warning surfaces
  rather than passing silently.
- **ESM interop under vitest** → `vitest.config.ts` inlines `vue` alongside `solid-js`
  and `react`, and resolves the browser/development conditions.
- **Vue prop-vs-attribute coercion** → the validation set is plain DOM elements
  (`section`/`input`/`button`) with string attributes; `h(kind, attributes, children)`
  applies them as attributes. A richer prop path is deferred.

## Open Questions

- **Vue view-registry component shape**: a functional component receiving the node's
  attributes as props; revisit if a typed Vue view-props contract is wanted later.
- **Whether to share a single `snapshotNativeEvent`/`renderNode` helper across adapters**:
  currently each adapter carries its own small copy; a shared DOM-helper module could
  follow if the duplication grows.
