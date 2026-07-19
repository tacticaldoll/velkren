## 1. React adapter view registry

- [ ] 1.1 Give `createReactRenderer` an optional options bag `{ container?, views? }` (every existing call site is no-arg, so backward-compatible). Define a React `View` type local to the adapter; `views` is `Record<string, View>`.
- [ ] 1.2 In `renderNode`, consult `views[node.kind]` for every node **before** the `translateAttribute`/`stringifyAttribute` loop and `createElement(node.kind)`: on a hit render the registered component passing the raw `node.attributes` as props (leaf: do not render children into it); on a miss render the primitive unchanged.

## 2. SolidJS adapter view registry

- [ ] 2.1 Give `createSolidRenderer` an optional options bag `{ container?, views? }` (backward-compatible). Define a Solid `View` type local to the adapter. Introduce a shared registry-aware helper that produces a node's content element: on a `views[node.kind]` hit render the registered Solid view (leaf, raw `node.attributes` as props); on a miss `document.createElement(node.kind)` + primitive attributes/children as today.
- [ ] 2.2 Use the shared helper in `buildElement`, and change the root render effect to rebuild the content into `rootContainer` each commit via that helper (`rootContainer.replaceChildren(helper(current()))`) instead of `renderInto`-mutating a fixed element — so a registered root view renders correctly and updates on commit. Registered views render within the root's reactive owner (effects dispose on unmount).

## 3. Tests (both adapters)

- [ ] 3.1 React: a registered view renders in place of the primitive with attributes as props (the test view must **consume** its props, not blind-spread onto a host element, so React logs no unknown-prop warning); an unregistered kind falls back; with no `views` output is unchanged.
- [ ] 3.2 Solid: the same three assertions.
- [ ] 3.3 On BOTH adapters: a registered view at the **root** renders and still updates on a subsequent commit; with an interaction bound on the root, an interaction on the registered root view's element bubbles to the container and is delivered through the port (identity stays on the container).
- [ ] 3.4 On at least one adapter: a registered view whose node carries children renders as a **leaf** — the Velkren-managed children are NOT projected into the native view.
- [ ] 3.5 Confirm `@velkren/core` still references no view/registry type and its Node-only suite is unaffected.

## 4. Definition of Done

- [ ] 4.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root; also `npx tsc -p packages/<adapter>/test/tsconfig.json --noEmit` for changed adapter test tsconfigs. Confirm all pass and core stays framework-neutral. Report any command that cannot run.
