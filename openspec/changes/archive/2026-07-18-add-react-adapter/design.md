## Context

`RendererPort` is symmetric and framework-neutral, proven on SolidJS and the fake
renderer. SolidJS attaches interaction capture imperatively, so the declarative
`registerInteraction` shape (D1 of `add-neutral-interaction-port`) — designed for a
framework whose managed tree cannot be listened to from outside — is unvalidated.
React is that framework: handlers must be woven into render output, and
`react-dom/client` renders asynchronously, so the port's synchronous `readIdentity`
and commit-repair contract needs explicit flushing. The failure channel this would
have exposed already shipped separately, so this change is the adapter plus its
validation.

## Goals / Non-Goals

**Goals:**

- A real React `RendererPort` adapter that satisfies the port — especially the
  declarative `registerInteraction` — with no change to `@velkren/core`.
- Honour the port's synchronous contract against React's scheduler.
- Prove core semantics stay renderer-independent on a reconciler framework.

**Non-Goals:**

- No mixed-framework tree, per-component renderer resolution, or plugin-based
  renderer selection (constructor injection stays).
- No Vue or third adapter; no React surface beyond what the port needs.
- No refactor of the archived two-editor app; no common adapter test-drive
  contract yet (see D4).

## Decisions

### D1: `registerInteraction` reads a mutable per-root registration store

The adapter holds one `ReactDOM.createRoot(container)` per port root and renders a
`VelkrenTree` element built with **`React.createElement`** (no JSX — see D5) from the
`RenderNode`. `registerInteraction(root, type, deliver)` stores `{type → deliver}` in
a **mutable ref** the adapter owns; the rendered handlers read that ref at event time,
e.g. the element is created with an `onClick` prop equivalent to:

```
createElement(kind, { onClick: (e) => registrations.current.get("click")?.(snapshotReactEvent(e)), ... }, children)
```

Registration therefore does **not** trigger a re-render and works before or after
mount. **Why over re-render-on-register**: a ref read at event time is the idiomatic
React bridge from external registration into a declarative tree. This is the concrete
proof that D1's "declare interest; the adapter wires it its own way" holds for a
reconciler — the case SolidJS never exercised.

**Interaction-type → handler-prop constraint.** React's synthetic-event system wires
only DOM-event-named types (`click` → `onClick`, `input` → `onInput`). The adapter
maps the interaction-type string to the corresponding synthetic handler prop and
supports the DOM-named types the validation needs; a non-DOM-named custom type has no
synthetic prop and is out of scope here (a ref + `addEventListener` escape hatch is a
later concern). This is a documented adapter limitation, not a core one.

### D2: Synchronous render via `flushSync`; identity maintained imperatively

`react-dom/client` `root.render(...)` schedules work; it does not flush to the DOM
synchronously. The port contract is synchronous: after `createRoot`/`commit` return,
`readIdentity` and the commit-repair check read the mounted DOM immediately. The
adapter wraps `root.render(...)` in `react-dom`'s `flushSync` for both `createRoot`
and `commit`. `removeRoot` calls `root.unmount()`.

**Identity is maintained imperatively, not via a prop.** React writes an attribute
only when its prop value changes between renders; the repair scenario removes the
attribute out-of-band while the prop value is unchanged, so a re-render would NOT
restore it. Therefore, after each `flushSync`, the adapter reads the mounted host
node from the container and imperatively `setAttribute(PROJECTION_IDENTITY_ATTRIBUTE,
identity)` — exactly as the SolidJS adapter stamps identity on every render. This is
what makes both the "present immediately after createRoot" and the commit-repair
scenarios pass. `readIdentity` reads the attribute back from the mounted DOM (the same
universal-DOM substrate SolidJS uses). The container is a detached element the adapter
creates and attaches under `document` so `readIdentity`/queries resolve.

Node attributes are passed to `createElement` as props with the required React
translations (`class`→`className`, `for`→`htmlFor`) and mapped children carry a
`key`; the minimal validation set uses simple string attributes, and a general
prop-translation layer is out of scope for this prototype.

### D3: Capture snapshots at the boundary; failures use the shipped `onFailure` channel

The rendered handler converts the synthetic event to an immutable JSON snapshot at
the adapter boundary (mirroring `snapshotNativeEvent`); the live node, synthetic
event, and React internals never cross into the runtime. A delivery-time failure is
handled by the runtime's `onFailure` channel (shipped in
`fix-interaction-failure-channel`) — the adapter neither dispatches events nor needs
to observe failures itself. A throw in a React event handler goes to `window.onerror`,
not an error boundary, which is exactly why relying on the channel (not a throw)
matters; this adapter independently confirms that need.

### D4: Cross-framework validation is a parallel React proof, not a shared composition

The two-editor app (`createEditorApp`) is **not** renderer-agnostic: it hardcodes
`createSolidRenderer()` and drives interaction through SolidJS-adapter-only affordances
(`elementForIdentity`, `simulateInteraction`, `container`) that are not part of
`RendererPort`. Reusing it on React would require extracting a renderer-agnostic
composition **and** defining a common adapter test-drive surface for those affordances
— a larger refactor of an archived change. This change instead ships a **parallel**
React validation that composes the same minimal component/template/event/layout set
through the React adapter and asserts the same guarantees: identity isolation,
business-event emission through the interaction-binding contract, and scoped disposal.
**Why**: a parallel validation is honest evidence that core semantics hold on a second
framework without refactoring archived work; the gold-standard "same composition,
swapped renderer" proof (and the common test-drive contract it needs) is a named
deferred follow-up, not silently skipped.

### D5: Package layout, deps, test environment, and test affordances

`packages/react-adapter/` mirrors the solid-adapter package (package.json, tsconfig,
`src/index.ts` — plain `.ts`, no JSX, so no `jsx` tsconfig option is needed), depends
on `@velkren/core` (workspace) and pinned `react`/`react-dom` (18.x, plus
`@types/react`/`@types/react-dom`). `@velkren/core` gains no dependency.

**No `act` apparatus.** The `VelkrenTree` holds no React state (`useState`/`setState`);
an interaction fires `deliver` → core `events.dispatch`, with zero in-React state
updates, so there is nothing for `act`/`IS_REACT_ACT_ENVIRONMENT` to flush — they are
omitted. Determinism comes from `flushSync` on render alone. (If React state were
introduced later, `act` would return.)

**Test environment.** React has no SSR/client export-condition split like SolidJS, so
there is no "client build" to resolve; the client entry is the `react-dom/client`
subpath and dev/prod is the already-global `development` condition. The adapter tests
declare a package-scoped happy-dom environment via a per-file docblock (as
solid-adapter's boundary test does), not the core Node-only env, and may need
`deps.inline: ["react", "react-dom"]` for ESM interop.

**Test affordances.** Like SolidJS, the concrete React renderer exposes non-`RendererPort`
test helpers — `elementForIdentity(identity)` and `simulateInteraction(identity, type)`
(the latter dispatches a native bubbling event on the identified node, which React's
delegated listener turns into the synthetic handler → `deliver`). These are how the
parallel validation drives and inspects the adapter; they are adapter-local, not part
of the core port.

**Structural asymmetry (intentional).** The SolidJS proof is a standalone package
(`@velkren/two-editor-validation`); the React proof lives inside `@velkren/react-adapter`
as a test. Both are validations, not public domains, so this asymmetry is fine — there
is deliberately no `@velkren/react-two-editor` package.

## Risks / Trade-offs

- **[Async React vs synchronous port]** Missing a flush makes `readIdentity` race the
  reconciler; and a re-render will not restore an out-of-band-removed attribute. →
  `flushSync` around every `render`, then imperative `setAttribute` of the identity on
  the mounted node (D2); the commit-repair test asserts the attribute post-commit.
- **[Registration survives re-render]** A `commit` re-renders a new `VelkrenTree`; its
  handlers must still read the same registration ref. → the ref is adapter-owned and
  stable across renders (not React state), so re-rendered handlers read the same map;
  registrations are cleared only on `removeRoot`, and disposal is asserted to leave no
  live handler.
- **[Parallel validation is weaker than shared-composition reuse]** It proves React
  _can_ satisfy the guarantees, not that the identical core composition runs unchanged.
  → Accepted and named as a deferred follow-up (D4); the guarantees asserted are the
  same set the Solid two-editor asserts.
- **[Non-DOM-named interaction types]** Unsupported by the synthetic-prop mapping. →
  Documented adapter limitation (D1); the validation uses DOM-named types.

## Migration Plan

In-repo only; depends on `fix-interaction-failure-channel` (already on main).

1. Scaffold `packages/react-adapter`; add pinned react/react-dom + vitest resolution.
2. Implement the port (`createRoot`/`commit`/`removeRoot` with `flushSync`;
   `readIdentity`; identity repair) and declarative `registerInteraction`.
3. Snapshot boundary + registration cleanup on unmount.
4. Adapter tests + the parallel React validation, in the package's browser-like env.
5. Run the full Definition of Done; sync the new `react-adapter` spec; archive
   (running the DoD again after sync).

Rollback is a straight revert; no persisted state.

## Open Questions

- When is the gold-standard shared-composition extraction (renderer-agnostic
  two-editor + a common adapter test-drive contract) worth doing? Deferred to its own
  change once a second adapter exists to justify the shared surface.
- Should the adapter grow a ref+`addEventListener` escape hatch for non-DOM-named
  interaction types? Deferred; not needed by the validation.
