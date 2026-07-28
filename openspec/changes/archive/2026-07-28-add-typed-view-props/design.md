## Context

`RenderNode`/`TemplateNode` (`packages/core/src/template-class.ts`) currently have one shape: `{ kind, attributes, children, slots }`. `kind` is dual-purpose — it is both the DOM tag name for the primitive path and, when it happens to match a key in an adapter's view registry, the selector for a registered framework-native view. `attributes` is likewise dual-purpose: literal DOM attributes for primitives, or ad hoc "props" for a registered view. Core validates `attributes` as strict JSON at plan-resolution time (`#buildNode` in `template-runtime.ts`, via `createJsonSnapshot`) but has no concept of "this is a view" — that association exists only inside each adapter's own registry lookup. `add-native-nested-views` proved the mechanism (registry, root views, anchors, child mounting) works end to end on all three adapters; this change gives the props channel its own typed, core-validated shape now that the mechanism has earned it.

## Goals / Non-Goals

**Goals:**

- Make "this node selects a registered view" a structural fact core can see and validate (non-blank `viewId`, strict-JSON `props`), without core referencing any concrete view type, adapter, or registry.
- Keep the existing primitive shape (`kind`/`attributes`/`children`/`slots`) unchanged for every node that doesn't opt into the view shape — zero behavior change for primitive-only trees.
- Make "a view node is a self-contained leaf" a type-level fact (no `children`/`slots` fields exist on the view variant) rather than only a documented adapter convention.

**Non-Goals:**

- No change to `RendererPort`, ownership, lifecycle, or the `mountChild`/anchor mechanism — a view node's leaf-ness is unrelated to whether an adapter later mounts a managed child into one of its anchors.
- No per-view props schema/validation (core still doesn't know what views exist or what shape their props should be beyond "strict JSON"). That would require core to reference adapter-owned registrations, which the standing neutrality invariant forbids.
- No migration tooling — this is an internal, pre-1.0 type change; every in-repo consumer (adapters, fixtures, tests) is updated in this same change.

## Decisions

**Discriminated union via a new `node` field, not reusing `kind`.** `ResolvedSlot` already uses `kind: "reference" | "content"` as a discriminant literal elsewhere in this file, but `TemplateNode`/`RenderNode`'s `kind` is a `string`-typed tag name, not a literal — widening it to `string | "view"` would not narrow (a `string` already accepts `"view"`), so discrimination needs a field the primitive shape doesn't already use for something else. `node: "view"` is optional/absent on the primitive variant (so existing primitive-only authoring is untouched) and a required literal on the view variant:

```ts
interface RenderPrimitiveNode {
  kind: string;
  attributes: JsonObject;
  children: readonly RenderNode[];
  slots: Readonly<Record<string, ResolvedSlot>>;
}
interface RenderViewNode {
  readonly node: "view";
  readonly viewId: string;
  readonly props: JsonObject;
}
type RenderNode = RenderPrimitiveNode | RenderViewNode;
```

(same shape for `TemplateNode`, with `attributes`/`props`/`children`/`slots` optional at authoring time, mirroring the existing template-authoring convention.)

**View node has no `children`/`slots` at the type level.** Per the view-registry spec, a registered view is already a self-contained leaf by default; encoding that as "the field doesn't exist" (rather than "exists but is ignored") makes an author's mistake a compile error instead of silent adapter-side dropping.

**Validation timing mirrors the existing `attributes` precedent exactly.** `freezeNode` (template authoring) only checks structural shape (`viewId` non-blank) — the same level of checking it already does for `kind`. Strict-JSON validation of `props` happens at plan-resolution time in `#buildNode`, via the same `createJsonSnapshot` call already used for `attributes`, so the two channels fail at the same point in the lifecycle for the same reason (non-JSON value), not two different points.

**A shared `isViewNode` type guard, exported from `@velkren/core`.** Every adapter and the fake renderer need to discriminate the same way; a single exported guard (`node is RenderViewNode` / `node is TemplateViewNode`) avoids each of the three adapters re-implementing the `"node" in x && x.node === "view"` check.

**Adapter view registries key on `viewId`, not `kind`, and only fire for the view variant.** `views[node.kind]` (Solid/React/Vue) becomes: for a primitive node, always render via the primitive path (registry is never consulted, removing the previous accidental-collision risk where a tag name like `"button"` could coincidentally match a registered view key); for a view node, look up `views[node.viewId]`.

**An unregistered `viewId` is an explicit error, not a primitive fallback.** Previously a registry miss fell back to `createElement(kind)` because `kind` was simultaneously a valid HTML tag name. A view node has no `kind`/tag name at all — there is nothing structurally sound to fall back to — so each adapter throws a clear error (`no view registered for viewId "…"`) on a miss, the same posture the child-mounting mechanism already takes for an unregistered anchor name (`"no anchor named …"`).

**Fake renderer keeps its existing `FakeRenderedNode` shape (`kind`/`attributes`/`children`) and gives a view node a degenerate projection** (`kind = node.viewId`, `attributes = node.props`, `children = []`) rather than growing a second shape, since the fake renderer has no registry concept of its own — it never simulated view-registry lookup, only DOM-analogue inspection. This keeps every existing fake-renderer-based test (which only builds primitive nodes) completely unchanged.

## Risks / Trade-offs

- **BREAKING type change** → every existing test/fixture that authored a "registered view" node via `{ kind: "dialog", attributes: {...} }` must be rewritten to `{ node: "view", viewId: "dialog", props: {...} }` in the same change (adapters' own test suites plus `packages/neutral-composition-fixture`). No runtime consumer exists outside this monorepo (pre-1.0, unpublished internal packages), so there is no external migration to coordinate.
- **Two similarly-named channels (`attributes` vs `props`) could still be confused by a template author** → mitigated by the type system: a primitive node's type has no `props` field and a view node's type has no `attributes` field, so mixing them is a compile error, not a runtime footgun.

## Migration Plan

Single change, single PR: update `@velkren/core`'s node types and validation, then update all three adapters' registry-consultation code and every affected test/fixture in the same commit set, so the repo is never in a partially-migrated state. No feature flag — this is a pre-1.0 internal contract with no external consumers.
