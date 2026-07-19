# Durable Multi-View Documents

A persistent document with multiple views — state that outlives any one element's
DOM presence and stays in sync across views — is a **composition pattern** over the
element membrane. It needs no `@velkren/core` change.

## The idea

Durability is an **application-service** concern, not a runtime concern. Velkren's
model is explicit: applications own their services, and it is not a data-owning
framework. So the document state lives in a host-owned service, and each view is an
ordinary **ephemeral** membrane whose component references that service.

```
   per-element ephemeral membrane views (each its own runtime)
        view A            view B            view C (attached later)
          │                 │                 │
          └───────── subscribe / edit ────────┘
                            │
                 host-owned document SERVICE   ← state lives here
                 (a plain app object, owned by no runtime)
```

- **State outlives a view.** Detaching an element disposes only that view's runtime.
  The service is not owned by any runtime, so its state survives.
- **Cross-view sync is explicit.** The service exposes `get` / `set` / `subscribe`.
  Each view subscribes on mount and re-commits its projection when the service
  changes; an interaction in one view calls `set`, and every subscribed view
  re-renders.
- **A new view reads the current state** straight from the service.

## Why not a shared runtime?

A shared _interactive_ runtime across views is blocked by design: the event,
component, and interaction domains are unique per runtime (`one runtime = one
view/app`). That uniqueness is a feature — it keeps views independent and
disposable. Sharing belongs one level out, at the service. The only thing the
service pattern gives up is shared Velkren _semantic events_ across views; the
service's own subscription replaces them, keeping coordination app-owned and
explicit.

## Sketch

```ts
// A host-owned service: a plain object, owned by no runtime.
function makeDocService(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set: (v) => { value = v; listeners.forEach((l) => l()); },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
}

// Each view is an ordinary ephemeral membrane whose factory:
//   - mints a runtime and composes a component that renders service.get()
//   - subscribes: on change, projection.commit(root, render(service.get()))
//   - binds an interaction that writes back: service.set(next)
//   - dispose(): unsubscribe, then release the component and projection
defineVelkrenElement("doc-view", { mount: ({ renderer, element }) => /* ... */ });
```

See `packages/solid-adapter/test/durable.test.ts` for a full, executable version.
