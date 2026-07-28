## Why

`add-native-nested-views` lets a registered native view expose a named anchor that `mountChild` targets, and its own spec already documents that a registered view "MAY be re-instantiated on commit" — a deliberate simplification. What was never designed is what happens to an _already-mounted child_ when that re-instantiation happens: the view's rebuild produces an entirely new DOM subtree, silently discarding whatever was previously mounted into its anchor. The child's own `AdapterRoot` (interaction listeners, internal framework state) is never told — it is orphaned: still "alive" from Velkren's own bookkeeping, but detached from the visible page with no path to clean it up. This is a real, reachable collision between two already-shipped features (`add-state-binding` driving a parent view's own re-commit, and `add-native-nested-views`'s child hosting), not a hypothetical edge case, and it sits in tension with PROJECT.md's own invariant that "every managed instance has an explicit, observable, and idempotent lifecycle" — an orphaned child has none of those.

## What Changes

- Each adapter (Solid/React/Vue) now tracks which child root (if any) is currently mounted at each of a root's named anchors.
- On every commit, each adapter snapshots its anchors before re-rendering/re-patching, then reconciles afterward:
  - If an anchor name still exists but now points to a **different** element (the exposing view was rebuilt), any child mounted there is **re-parented** — its own container DOM element is moved into the new anchor element via a plain `appendChild`, with no rebuild, no disposal, no interruption to its identity, DOM state, or interaction listeners.
  - If an anchor name **no longer exists at all** after the commit (the rebuilt view stopped exposing it), any child still mounted there has nowhere to live — it is released through the same disposal path `removeRoot` already uses, and the loss is reported through the adapter's existing failure-reporting convention (`globalThis.reportError`, falling back to `console.error`) rather than silently disappearing.
- No change to `@velkren/core`, `RendererPort`'s shape, or any public API — this is adapter-internal bookkeeping and behavior, tightening an existing contract rather than adding one.

## Capabilities

### Modified Capabilities

- `solid-adapter-prototype`: the child-mounting requirement gains the anchor-replacement reconciliation guarantee (reparent-first, release-and-report only when the anchor is gone).
- `react-adapter`: same guarantee added to its child-mounting requirement.
- `vue-adapter`: same guarantee added to its child-mounting requirement.

## Impact

- **Code**: `packages/{solid,react,vue}-adapter/src/index.ts` only — new adapter-internal bookkeeping (which child is mounted at which anchor) and a reconciliation step run after every commit. No new public exports, no signature changes to any existing exported function.
- **Behavior change (bug fix, not a new feature)**: previously, a parent view rebuild silently detached any live child; now it is preserved whenever the anchor name persists, and explicitly released-and-reported only when it doesn't. Existing callers see no change unless they were already relying on (undefined, undocumented) orphaning behavior, which nothing in the codebase does.
- **Non-goals**: no change to the "a registered view MAY be re-instantiated on commit" behavior itself (the root cause of _why_ anchors can be replaced) — this change makes replacement safe, it does not try to avoid it. No support for multiple children mounted at the same anchor name (already out of scope per `add-native-nested-views`'s own deferred list; this change tracks at most one child per anchor name, consistent with that).
