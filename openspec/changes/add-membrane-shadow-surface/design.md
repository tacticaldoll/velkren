## Context

The membrane projects into light DOM. For a foreign-host embed, that means the host's
global CSS applies to the component and the component's styles leak out — the main
practical blocker to embedding. This change adds an opt-in shadow-DOM surface for
style encapsulation.

The current membrane creates `createSolidRenderer({ container: this })`; the renderer
appends per-root containers to the container, and each per-root container carries the
identity attribute and the interaction listener (the container anchor).

## Goals / Non-Goals

**Goals:**

- Opt-in shadow-DOM surface for style encapsulation; light DOM stays the default.
- An explicit interior-styles channel; no silent global-style crossing.
- Keep interaction, identity/commit-repair, and outward events working unchanged.
- No `@velkren/core` or `RendererPort` change.

**Non-Goals:**

- Slotted native nesting; SSR / Declarative Shadow DOM.
- Form-associated participation (`ElementInternals`) and cross-boundary ARIA.
- Inbound data crossings, durable lifetime (separate changes).

## Decisions

### 1. Shadow via a wrapper element, so the renderer is untouched

When `shadow` is set, the membrane attaches a shadow root to the host element, creates
a wrapper `div` inside it, and passes that wrapper as the renderer's existing
`container`. Everything downstream (per-root containers, identity, interaction,
commit-repair) is unchanged — it just lives inside the shadow root now.

- **Alternative rejected**: widen `createSolidRenderer`'s `container` to accept a
  `ShadowRoot`. Rejected — `SolidRenderer.container` is typed `HTMLElement` and is read
  by callers; a wrapper element keeps the adapter contract and its types intact and
  keeps the change purely at the membrane level.

### 2. No `composedPath` — the listener is inside the shadow tree

Shadow-DOM retargeting only rewrites `event.target` for listeners _outside_ the
target's shadow tree. The interaction listener sits on the per-root container, which
is inside the shadow root — the same tree as the interacted element — so `event.target`
is the real inner node, unretargeted. The earlier assumption that shadow needs
`composedPath()` presumed a host-element listener; the container anchor makes it
unnecessary. `snapshotNativeEvent` is unchanged.

### 3. Interior styles are an explicit host channel

The config's `styles` (CSS text) is injected into the shadow root as a `<style>`
element at attach time. The membrane never copies the host page's global stylesheets
in. This keeps encapsulation honest: what is inside is only what the host explicitly
provided.

### 4. Shadow attaches once; reused across mount cycles

`attachShadow` may be called only once per element. The membrane attaches the shadow
root (and wrapper) lazily on first mount and stores the wrapper, reusing it on a later
fresh mount after a confirmed detach. A move never re-attaches (the existing mount is
preserved). The wrapper is empty after a dispose (the projection removed its roots),
so reuse is clean.

### 5. Outward events stay on the host element

`dispatchBoundaryEvent` continues to dispatch on the host element (the shadow host),
which is in light DOM, so boundary events bubble into the host page normally.
`composed` is moot because the dispatch origin is already outside the shadow root.

## Risks / Trade-offs

- **`attachShadow` called twice** → attach lazily once and store the wrapper; guard on
  the stored wrapper, not on `this.shadowRoot` (null for `closed`).
- **Closed mode is not inspectable from outside** → intended; validation covers the
  open-mode flow fully and asserts closed mode mounts without leaking into light DOM.
- **Global design-system CSS will not apply inside the shadow** → by design; the host
  adopts what it needs via the `styles` channel. Documented as the encapsulation trade.

## Open Questions

- **`styles` as adopted stylesheets vs a `<style>` element**: a `<style>` element is
  the simplest portable form; constructable/adopted stylesheets could be a later
  refinement for sharing one sheet across instances.
- **`shadow` default mode**: `open` (debuggable/testable) proposed when `shadow: true`;
  `closed` available explicitly. Non-constitutional — authority is not in the DOM
  either way.
