## Context

Velkren resolves component instances into renderer-neutral render plans (named roots, abstract node trees, slots). Nothing yet projects a plan onto a surface. Projection is the first place DOM identity and renderer integration appear, and the constitutional invariants are explicit that renderers and the DOM are one-way projections that must not define runtime identity, and that renderer-specific types must not enter core contracts.

This change introduces the renderer boundary as a port that adapters implement, a managed RootHandle per projected root, a permanent runtime-assigned identity written to the surface for observability, managed repair of that identity on commit, and an in-memory fake renderer for tests. The surface is observable but never authoritative; ownership stays opaque and runtime-local. Real DOM/SolidJS renderers, layout, and reactivity are deferred.

## Goals / Non-Goals

**Goals:**

- A framework-independent `RendererPort` adapters implement, driven with renderer-neutral render nodes and identity tokens.
- Managed RootHandles with opaque ownership, idempotent release, and one handle per named root.
- A permanent, runtime-assigned identity token per root, written to the surface and stable across commits.
- Managed commit repair that restores the identity attribute if the surface loses it.
- Ownership and authority that never depend on surface attributes, identity tokens, or selectors.
- A framework-owned in-memory fake renderer for inspection and tests, with no browser globals.

**Non-Goals:**

- Real DOM renderers, SolidJS, or any reactive primitive.
- Layout measurement/scheduling and event-source wiring.
- Diffing/reconciliation strategy beyond delivering the current plan to the port.
- Hot template replacement and server rendering.

## Decisions

### Make the renderer a port, not a dependency

Core defines `RendererPort` with `createRoot(identity, node) -> AdapterRoot`, `commit(adapterRoot, identity, node)`, `readIdentity(adapterRoot) -> string | undefined`, and `removeRoot(adapterRoot)`. `AdapterRoot` is opaque to core. The port trades only in the existing renderer-neutral `RenderNode` and a string identity token, so no DOM, JSX, or renderer type enters core. `createProjectionRuntime(runtime, renderer)` validates that the value implements every port operation and fails explicitly otherwise.

Alternative considered: let core construct DOM nodes directly behind a flag. Rejected — it would pull renderer types into the core contract and make the surface authoritative.

### Assign identity in the runtime and treat the surface as a projection

The runtime assigns each root a stable identity token (`<instanceId>::root/<rootName>` qualified, allocated once at mount) that is independent of the plan's content. The token is passed to the port at `createRoot` and re-passed at every `commit`; the adapter writes it to the surface as a permanent attribute. The token is diagnostic: it lets an observer correlate a surface node with a runtime root, but it never flows back into ownership or resolution. This is the concrete enforcement of "renderers and DOM are one-way projections."

Alternative considered: derive identity from the render plan or from a surface attribute. Rejected — plan-derived identity is unstable across commits, and surface-derived identity would make the DOM the source of truth.

### Repair identity on every commit

Because the surface can be mutated by anything outside the runtime, `commit` re-applies the identity attribute unconditionally and, when `readIdentity` shows the attribute was removed or altered, repairs it to the runtime-assigned token. Repair never changes the token — it only reasserts it. Content nodes are delivered to the port as-is; identity is the one invariant the runtime guarantees on the surface.

### Model RootHandles as managed resources

Each projected root is a managed resource (reusing the managed-lifecycle kernel): opaque ownership, runtime-qualified id, active-only commit, and an idempotent release whose cleanup calls `removeRoot` through the port. Mounting a multi-root plan produces one RootHandle per named root; releasing the projection releases every owned root in reverse order. Foreign instances are rejected before any port call; foreign or imitation RootHandles are rejected before commit/removal, exactly as other domains validate ownership at operation entry.

### Ship an in-memory fake renderer

A framework-owned fake renderer implements the port with a plain in-memory node tree (`{ kind, attributes, children }`) and an identity attribute per root. It exposes read access to the tree and identities so tests can assert projection, identity stability, and repair. It is the reference adapter that proves the port is sufficient and framework-independent before a real SolidJS adapter exists.

## Risks / Trade-offs

- **The surface could become authoritative** → Identity is runtime-assigned and one-way; no operation reads authority from the surface, and ownership stays opaque.
- **Identity attribute drift on the surface** → Repair the attribute on every commit and reassert it when `readIdentity` shows loss.
- **A foreign instance or RootHandle slips into a port call** → Validate opaque ownership before any port invocation, matching the ownership-isolation invariant.
- **Renderer types leaking into core** → The port trades only in RenderNode and string tokens; the fake renderer, not core, owns the surface representation.
- **Partial mount on multi-root failure** → If any root fails to create, release already-created roots before rejecting so no partial projection is published.

## Migration Plan

1. Add the RendererPort contract, RootHandle and identity types, and projection errors without changing existing domains.
2. Add the projection runtime: validate the port, resolve/accept a render plan, and mount one managed RootHandle per named root with runtime-assigned identity.
3. Add commit with mandatory identity repair and active-only, ownership-checked operations.
4. Add the in-memory fake renderer and expose read access to its tree and identities.
5. Compose the projection facade into the public API and prove no renderer/DOM type is exported.
6. Run the full existing suites to prove component, template, event, listener, and plugin behavior is unchanged.

Rollback removes the projection facade, fake renderer, and port; all prior domains remain source-compatible because projection only consumes their current contracts.

## Open Questions

- Whether the port should later expose batching/transaction hooks for a real renderer's commit phase; deferred until the SolidJS adapter defines its commit needs.
- Whether roots need ordering metadata for layout; deferred to the layout coordination change.
