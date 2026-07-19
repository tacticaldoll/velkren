## Why

The element membrane projects into light DOM, so an embedded Velkren component
shares the host page's global CSS: the host's styles clobber the component and the
component's styles leak out. That is the single biggest practical blocker to the
membrane's stated purpose — dropping a component into a foreign host (a CMS, another
team's app). Style encapsulation is what a real embed needs.

The platform's answer is the shadow DOM, and it fits the membrane cleanly. A design
note from the earlier membrane work assumed shadow mode would need `composedPath()`
to recover the interacted node — but that assumed the interaction listener sat on the
host element. It does not: the container-anchor design puts the listener on the
per-root container, which moves _inside_ the shadow root, in the same tree as the
interacted element, so `event.target` is not retargeted. Shadow mode is therefore a
small, additive change.

## What Changes

- Add an **opt-in shadow-DOM surface** to the membrane, selected in the registration
  config (`shadow`). Default stays **light DOM**. When enabled, the membrane attaches
  a shadow root to the host element and projects the composition inside it, so the
  surface is style-encapsulated.
- Add an **interior-styles channel** (`styles`): the host supplies the CSS the shadow
  root should adopt. The membrane MUST NOT silently pull global styles across the
  shadow boundary.
- The **anchor is unaffected**: the repairable identity attribute and the interaction
  container listener stay on the adapter-owned per-root container, now inside the
  shadow root. Interaction is captured from the native event target **without**
  `composedPath()`, because the listener is in the same tree as the interacted node.
- **Outward events are unaffected**: `dispatchBoundaryEvent` still dispatches on the
  host element, so boundary events bubble into the host's light DOM regardless of the
  surface.
- `@velkren/core` and the `RendererPort` contract are **unchanged**: the membrane
  passes a wrapper element inside the shadow root as the renderer's existing
  `container`, so nothing downstream changes.

## Capabilities

### New Capabilities

<!-- None. This extends the existing element-membrane capability. -->

### Modified Capabilities

- `element-membrane`: reframe the light-DOM surface as the **default** (shadow is now
  an explicit opt-in, no longer out of scope) and add a requirement for the
  **shadow-DOM projection surface** — attaching the shadow root, the interior-styles
  channel, interaction captured inside the shadow tree without `composedPath`, the
  anchor staying on the per-root container, and outward events still dispatched on the
  host element.

## Impact

- **New**: a `shadow` and `styles` option on the membrane config in
  `@velkren/solid-adapter`, plus a validation that a shadow membrane projects inside a
  shadow root, captures interactions, adopts only host-provided styles, and still
  relays outward events.
- **Unchanged**: `@velkren/core` — no new core API, no DOM type; and the adapter's
  `RendererPort` and `createSolidRenderer({ container })` (the membrane passes a
  wrapper inside the shadow root as the container).
- **Reused**: the per-root container anchor (identity + interaction), the outward
  event relay (dispatched on the host element).
- **Deferred (explicit non-scope)**: slotted native nesting (`add-native-nested-views`);
  SSR / Declarative Shadow DOM; form-associated participation and cross-boundary ARIA
  concerns; inbound data crossings and durable lifetime (separate changes).
