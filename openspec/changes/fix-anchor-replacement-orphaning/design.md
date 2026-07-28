## Context

Every adapter's `anchors: Map<string, HTMLElement>` is a single closure-scoped Map, created once per root and mutated in place across every commit — a view's `registerAnchor(name, element)` call is just `anchors.set(name, element)`, which never deletes anything and never has a concept of "this is a replacement, not a first registration." `mountChild`'s existing staleness guard (`!parentRoot.container.contains(anchorElement)`) protects a *future* `mountChild` call from targeting a detached element, but does nothing for a child *already* mounted before the replacement happens — there is currently zero bookkeeping anywhere connecting "this anchor name" to "the child currently living there."

Severity differs by adapter because of how much each one's rendering path rebuilds on every commit:

- **Solid**: `patchNode` always fully rebuilds via `renderNodeElement` when either side of a commit is a view node (`isViewNode(oldNode) || isViewNode(newNode)`) — so a view's anchor is guaranteed to be replaced on every single commit of its own position, not just when its props meaningfully change.
- **React/Vue**: the whole tree is rebuilt via `createElement`/`h` on every commit, but each framework's own reconciler may reuse the underlying DOM node (and therefore never re-fire the `ref` callback that calls `registerAnchor`) if the vnode's shape/key/type at that position is unchanged. Orphaning is real but less frequent — it happens only when React/Vue itself decides to unmount+remount that specific host node.

Both cases funnel through the exact same fix, because both already maintain the exact same `anchors: Map<string, HTMLElement>` shape and the exact same commit-time render call (`patchNode` for Solid, `flushSync(() => reactRoot.render(...))` for React, `render(h(...), container)` for Vue) that is the only place anchors can change.

This fix assumes `registerAnchor` is always called synchronously within the commit that triggers it — true for every `registerAnchor` call in the codebase today (a view calls it directly from its own render body or a `ref` callback, both synchronous within one commit's render/patch pass). If a view ever called `registerAnchor` from an independently-scheduled reactive primitive of its own (e.g. a Solid `createEffect` that reruns later, unrelated to the parent's own commit), that mutation would land outside any commit's snapshot/diff window and would not be reconciled — an explicit, acknowledged limitation of the snapshot-before/diff-after approach, not a gap this change tries to close.

The React/Vue side of this fix is real but meaningfully rarer than Solid's: `registerAnchor` typically fires from a `ref` callback the view author writes, and both frameworks' own ref semantics re-invoke that callback on every render regardless of whether the underlying DOM node actually changed — so in the common case `anchors.set` re-runs with the *same* element reference, which the diff correctly treats as unchanged (a no-op). Actually forcing React/Vue to remount the host node (and therefore replace the anchor's element) requires the view itself to change that position's key or element type — a real, app-authorable scenario, but a narrower trigger than Solid's unconditional "a view is always re-instantiated on commit."

## Goals / Non-Goals

**Goals:**
- A child mounted at a named anchor survives a parent commit that replaces the underlying element for that same anchor name, with zero interruption to the child's own identity, DOM, or interaction listeners.
- A child whose anchor genuinely disappears is released deterministically and the loss is reported through an existing, established channel — never silently.
- Identical mechanism and guarantee across all three adapters, reusing each adapter's own already-existing `anchors` map and `removeRoot` disposal path.

**Non-Goals:**
- Not attempting to make views stop rebuilding on every commit (that's `add-typed-view-props`/`fix-solid-commit-reconcile`-era territory, a much larger change with its own tradeoffs) — this change makes replacement *safe*, it doesn't try to prevent replacement from happening.
- Not supporting multiple children mounted at the same anchor name — out of scope per `add-native-nested-views`'s own deferred list, and this change's tracking (one child per anchor name) is consistent with that existing limitation, not a new one.
- Not adding a new, app-configurable failure-observer API for this specific failure — reusing the same ambient `globalThis.reportError`/`console.error` fallback the membrane boundary (`packages/element/src/index.ts`) already uses for its own never-silently-swallowed errors, rather than inventing a second failure-reporting convention.

## Decisions

**Track "which child is mounted at which anchor" as a `childrenByAnchor: Map<string, AdapterRoot>` on the PARENT's own adapter-root record**, alongside the existing `anchors` map — populated in `mountChild` right after a child root is created, and a back-reference (`mountedAt: { parent, anchor }`) stored on the CHILD's own record so `removeRoot`/disposal can find and clear the parent's entry without a second registry to keep in sync.

**Snapshot `anchors` before every commit's render call, diff after.** This is the same three-line pattern in all three adapters: capture `const oldAnchors = new Map(anchors)` immediately before the framework-specific render/patch call, let it run unchanged, then reconcile:
```
for each (name, childRoot) currently in childrenByAnchor:
  newElement = anchors.get(name)
  if newElement === undefined:      → release childRoot (shared dispose path), report the loss
  else if newElement !== oldAnchors.get(name): → newElement.appendChild(childRoot's own container)
  else:                              → unchanged, no-op
```
Doing this unconditionally on every commit (not just ones that "look like" they touched a view) is deliberately simple: the snapshot is a shallow copy of a typically 0-2-entry Map, the diff is a handful of reference comparisons — negligible cost relative to the render/patch call it wraps, and avoids having to correctly detect "did this commit possibly touch a view" as a separate, error-prone precondition.

**Reparenting is a plain `appendChild`, nothing else.** A child's own container is just a DOM element with an identity attribute and native event listeners attached via `addEventListener` — moving it to a new parent in the DOM does not reset listeners, does not affect a Solid `createRoot`'s reactive scope, a React root, or a Vue app instance, all of which only care about the DOM node object they were given, never its ancestry. No adapter-specific teardown/rebuild of the child is needed or wanted.

**Extract the existing `removeRoot` body into a shared internal dispose function**, so both the public `removeRoot` and the new reconciliation-triggered release call the exact same disposal logic (listener cleanup, `rootsByIdentity` deletion, framework-specific unmount, DOM removal) — no duplicated teardown logic, no risk of the two paths drifting apart.

**Failure reporting reuses the ambient `reportError`/`console.error` pattern**, not a new observer API. This mirrors `packages/element/src/index.ts`'s `reportMembraneError` exactly (`(globalThis as {reportError?: ...}).reportError?.(error) ?? console.error(error)`) — consistent with the existing convention for "adapter/boundary-level failures with no per-call app-supplied observer," as opposed to `fix-interaction-failure-channel`'s per-binding `onFailure` observer (which is specific to the interaction-binding domain and not applicable here).

## Risks / Trade-offs

- **A child mounted at the same anchor name twice (unsupported, but not newly broken) still only has its most recent occupant tracked** — consistent with `add-native-nested-views`'s existing "multiple children reconciled within one anchor" being out of scope; not a regression, just not newly solved either.
- **Reparenting changes DOM structure without going through either adapter's own reconciliation loop** — this is intentional (the whole point is to avoid disturbing the child), but worth naming explicitly since it's the one place in each adapter that manipulates a *child* root's DOM from outside that child's own commit/patch path.

## Migration Plan

Single change, single PR, confined to the three adapter packages. No feature flag — this tightens existing behavior (previously undefined/silently broken) into defined behavior; no caller could have been correctly relying on the old silent-orphaning behavior, since nothing in the codebase exercises it.
