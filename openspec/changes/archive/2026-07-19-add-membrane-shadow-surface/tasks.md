## 1. Shadow surface opt-in

- [x] 1.1 Add `shadow?: boolean | "open" | "closed"` and `styles?: string` to `MembraneConfig` in `@velkren/solid-adapter`
- [x] 1.2 When shadow is enabled, attach a shadow root once, create a wrapper element inside it, and pass the wrapper as the renderer's `container`; light mode keeps using the element
- [x] 1.3 Inject the config's `styles` into the shadow root as a `<style>`; never copy global page stylesheets across the boundary
- [x] 1.4 Attach the shadow lazily and store the wrapper so a fresh mount after a confirmed detach reuses it (a move never re-attaches)

## 2. Preserve the anchor and the crossings

- [x] 2.1 Keep the identity attribute and interaction listener on the per-root container (now inside the shadow root); no `composedPath` — the listener is in the same tree as the interacted node
- [x] 2.2 Keep `dispatchBoundaryEvent` dispatching on the host element so outward events bubble into the host's light DOM

## 3. Core-neutrality guard

- [x] 3.1 Verify no `@velkren/core` or `RendererPort` change; the shadow surface lives only in the membrane

## 4. Validation

- [x] 4.1 Add a shadow (open) membrane test: projection renders inside the shadow root, light DOM stays empty, the per-root container carries the identity attribute
- [x] 4.2 Assert interaction through the shadow root emits the business event (no `composedPath`), and the outward boundary event still bubbles to a host ancestor
- [x] 4.3 Assert only host-provided styles are inside the shadow root; assert a closed-mode membrane mounts with `shadowRoot` null and no light-DOM children

## 5. Definition of Done

- [x] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check` from the project root and address findings
- [x] 5.2 Run an adversarial review of the apply output against the PROJECT.md invariants and this change's requirements before committing
