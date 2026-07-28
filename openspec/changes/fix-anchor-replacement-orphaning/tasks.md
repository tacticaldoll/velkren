## 1. Solid adapter

- [ ] 1.1 In `packages/solid-adapter/src/index.ts`, add `childrenByAnchor: Map<string, SolidAdapterRoot>` to `SolidAdapterRoot`, and an optional back-reference `mountedAt?: { parent: SolidAdapterRoot; anchor: string }` on the same interface (set only on a child root created via `mountChild`).
- [ ] 1.2 Extract the body of `removeRoot` into a shared internal `disposeRoot(adapterRoot: SolidAdapterRoot): void` (listener cleanup, `rootsByIdentity` deletion, `adapterRoot.dispose()`, `rootContainer.remove()`), and — as part of that same function — if `adapterRoot.mountedAt !== undefined` and the parent's `childrenByAnchor.get(anchor) === adapterRoot`, delete that entry. `removeRoot` itself becomes a thin wrapper calling `disposeRoot`.
- [ ] 1.3 In `mountChild`, after creating the child root, set `root.mountedAt = { parent: parentRoot, anchor }` and `parentRoot.childrenByAnchor.set(anchor, root)`.
- [ ] 1.4 In `mountRootInto`'s `createRenderEffect`, in the commit (`else`) branch: snapshot `const oldAnchors = new Map(anchors)` immediately before calling `patchNode`; after it returns (and after the `rootContainer.replaceChild` swap, if any), call a new `reconcileAnchoredChildren(root, oldAnchors)` — note `root` is being constructed in this same closure, so reference the in-progress `root` variable (already assigned by the time the effect re-runs on a later commit).
- [ ] 1.5 Implement `reconcileAnchoredChildren(root: SolidAdapterRoot, oldAnchors: ReadonlyMap<string, HTMLElement>)`: for each `[name, childRoot]` in `root.childrenByAnchor`, compare `root.anchors.get(name)` against `oldAnchors.get(name)`: unchanged → no-op; a different, defined element → `newElement.appendChild(childRoot.rootContainer)`; `undefined` (anchor gone) → `root.childrenByAnchor.delete(name)`, report via `reportAnchorLost(name)` (a small local helper mirroring `packages/element/src/index.ts`'s `reportMembraneError`: `globalThis.reportError?.(...)` falling back to `console.error`), then `disposeRoot(childRoot)`.

## 2. React adapter

- [ ] 2.1 Mirror 1.1-1.3 for `ReactAdapterRoot` (`childrenByAnchor`, `mountedAt`, wiring in `mountChild`).
- [ ] 2.2 Extract `removeRoot`'s body into `disposeRoot(adapterRoot: ReactAdapterRoot)` (React-specific teardown: listener cleanup, `registrations.clear()`, `reactRoot.unmount()`, `container.remove()`), with the same parent-`childrenByAnchor` cleanup as 1.2.
- [ ] 2.3 In `commit`, snapshot `oldAnchors` immediately before the `flushSync(() => adapterRoot.reactRoot.render(...))` call; call `reconcileAnchoredChildren(adapterRoot, oldAnchors)` immediately after (before or after the identity re-stamp — order doesn't matter, they touch different concerns).
- [ ] 2.4 Implement `reconcileAnchoredChildren` identically in shape to 1.5, using `childRoot.container` (React's field name) instead of `rootContainer`.

## 3. Vue adapter

- [ ] 3.1 Mirror 1.1-1.3 for `VueAdapterRoot`.
- [ ] 3.2 Extract `removeRoot`'s body into `disposeRoot(adapterRoot: VueAdapterRoot)` (Vue-specific teardown: listener cleanup, `registrations.clear()`, `render(null, adapterRoot.container)`, `container.remove()`), with the same parent-`childrenByAnchor` cleanup.
- [ ] 3.3 In `commit`, snapshot `oldAnchors` immediately before the `render(h(VelkrenTree, {...}), adapterRoot.container)` call; call `reconcileAnchoredChildren(adapterRoot, oldAnchors)` immediately after.
- [ ] 3.4 Implement `reconcileAnchoredChildren` identically in shape to 1.5/2.4, using `childRoot.container` (Vue's field name).

## 4. Tests (all three adapters, mirrored)

- [ ] 4.1 A test per adapter: mount a dialog view with an anchor, `mountChild` a child into it, capture the child's container element reference, commit the *parent* root again with a change that causes the view to rebuild (for Solid: any commit at all, since it always rebuilds; for React/Vue: a prop/attribute change on the dialog node forcing the framework to remount that position — may need a `key`-changing or structurally-different vnode to force it), then assert: the child's container is the *same element reference* as captured before, it is now a descendant of the *new* anchor element, and the child's own identity/interaction registration still works (a simulated interaction still reaches it).
- [ ] 4.2 A test per adapter: same setup, but commit the parent with a node that no longer registers the anchor at all (e.g. swap the dialog view out for a plain primitive, or a dialog variant with no body div); assert the child is released (`readIdentity`/`elementForIdentity` no longer finds it, its container is removed from the DOM) and that the failure-reporting path was invoked (spy on `globalThis.reportError` or capture `console.error`).
- [ ] 4.3 Confirm the existing "mounts a child projection... isolated from the parent" and "removing the child root leaves the parent view intact" tests in each adapter's suite still pass unchanged (no regression to the non-replacement paths).

## 5. Verification and documentation

- [ ] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` at the workspace root; fix any fallout.
- [ ] 5.2 Run `openspec validate --strict` and `openspec validate --specs`; resolve any issues.
- [ ] 5.3 Update `BACKLOG.md`'s `add-native-nested-views` entry: the "Deferred" note about a re-rendering view orphaning its child is now resolved; add a note (or a new entry) documenting the fix.
- [ ] 5.4 Commission an independent adversarial review before committing apply output, focused on: does the reparent-vs-release branch correctly distinguish "anchor still exists, new element" from "anchor still exists, same element" from "anchor gone"; does `disposeRoot`'s parent-cleanup guard (`childrenByAnchor.get(anchor) === adapterRoot`) correctly avoid clobbering a *different* child that was mounted at the same anchor name after this one was already replaced; is the failure-reporting path actually exercised (not just wired but silently never triggered) in a realistic scenario.
