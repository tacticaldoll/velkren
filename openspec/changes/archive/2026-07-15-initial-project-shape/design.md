## Context

The repository is currently a generic TypeScript/OpenSpec starter. It has no source files, package layout, product contract, lockfile, tests, lint configuration, or executable Definition of Done. The broader Velkren architecture calls for semantic events, plugins, component instances, templates, layout, browser projection, and a SolidJS adapter, but all of those features depend on a smaller set of stable invariants: runtime ownership, managed lifecycle, typed registration, and central creation.

The first implementation must therefore establish the repository and those invariants without prematurely implementing the higher-level runtime. The core must run in Node.js and must not depend on DOM or SolidJS types.

## Goals / Non-Goals

**Goals:**

- Replace starter metadata with Velkren's product purpose, constitutional constraints, terminology, and priorities.
- Establish an npm-workspaces TypeScript monorepo with a single initial `@velkren/core` package and executable root quality gates.
- Define stable identifier primitives that distinguish local slugs, canonical class IDs, qualified registrations, and managed instance IDs.
- Establish opaque runtime ownership independently from readable runtime IDs.
- Provide one managed lifecycle implementation with reverse-order resource cleanup and diagnostic tombstones.
- Prove the generic typed-registration and central-factory contracts using a small internal test class kind before adding domain-specific event or component APIs.
- Preserve clear extension seams for later typed registries and factories.

**Non-Goals:**

- Semantic event payloads, listeners, relayers, middleware, or browser event adapters.
- Plugin installation transactions or namespace autoloaders.
- Component trees, templates, render plans, DOM root attributes, or layout scheduling.
- SolidJS integration or UI components.
- Hot replacement of live instances.
- A universal public registry that mixes class kinds.

## Project Contract Content

Task 1.1 SHALL replace the placeholder `PROJECT.md` with the following project-level contract. This section is the source of truth for that documentation change; implementation details elsewhere in this design do not override it.

### Purpose

Velkren is an explicit, composable browser-side UI runtime for stateful application interfaces. It owns runtime semantics for definitions, managed instances, identity, scopes, state, bindings, semantic events, templates, layout, capabilities, plugins, lifecycle, and inspection. Rendering and browser integration are provided through adapters; applications own their definitions, policies, services, and customization.

### Constitutional invariants

- A runtime is a complete ownership, registration, scope, lifecycle, and inspection boundary. Multiple runtimes remain independent, and runtime-created objects cannot be operated by another runtime.
- Readable IDs support diagnostics; opaque ownership identities authorize operations. Strings, DOM attributes, and selectors never grant runtime ownership.
- Pure definitions are reusable descriptions. Registrations belong to one runtime. Managed instances are created only through the owning runtime's typed factory.
- Definitions have immutable local identities. Typed registries add kind identity, runtime registrations add runtime identity, and duplicate active registrations never resolve through last-write-wins behavior.
- Every managed instance has an explicit, observable, and idempotent lifecycle. Release revokes capabilities and cleans all owned resources without silently swallowing failures.
- Coordination is explicit. Public references, scopes, capabilities, semantic events, and relayers replace selector-based component discovery and implicit global lookup.
- Runtime state is authoritative. Renderers and DOM are one-way projections and do not define runtime identity, scope, event, binding, or lifecycle semantics.
- Renderer-specific types and reactive primitives do not appear in framework-independent core contracts.
- Runtime mechanisms expose registration, replacement, removal, composition, inspection, tracing, testing, and cleanup through public contracts rather than import order, prototype mutation, or private override points.
- Constraints are enforced at runtime boundaries so applications remain free to compose definitions, adapters, plugins, policies, and services without hidden global behavior.

### Terminology

- **Runtime**: One isolated owner and composition boundary for registrations, scopes, managed instances, and resources.
- **Definition**: An immutable, portable description that is not owned by a runtime until registered.
- **Registration**: A runtime-owned association between a typed canonical class ID and a definition.
- **Managed instance**: A factory-created, runtime-owned object with identity, lifecycle, capabilities, and cleanup obligations.
- **Scope**: An explicit authority boundary that controls which references, services, and event endpoints are available.
- **Reference**: An owner-validated capability for interacting with a managed instance or endpoint; possession does not expose private runtime capabilities.
- **Projection**: Renderer or DOM output derived from runtime state; it is observable but not authoritative.
- **Adapter**: A replaceable integration that connects core contracts to a renderer, browser API, or other external mechanism.

### Priorities

When changes compete, prefer them in this order:

1. Ownership safety, lifecycle correctness, data integrity, and deterministic cleanup.
2. Explicit, inspectable runtime semantics and conformance with accepted OpenSpec requirements.
3. Small public interfaces and framework-independent composition.
4. Developer and operator ergonomics.
5. Optional integrations, scale-out behavior, and convenience abstractions.

Enabling work does not automatically authorize adjacent feature scope. Each new domain earns its public API through a separate OpenSpec change.

### Product non-goals

- Velkren is not a compatibility implementation or migration target for another UI framework.
- Velkren is not a full-stack application framework and does not own routing, server rendering, data fetching, authentication, build tooling, deployment, or backend architecture.
- Velkren does not use DOM selectors or global component queries as an application coordination API.
- Velkren does not expose renderer-native reactive objects as its public state or lifecycle model.
- Velkren does not rely on automatic scanning, import-order overrides, global mutable registries, deep inheritance, or prototype patching.
- Initial changes do not implement advanced UI components, remote component protocols, visual designers, broad compatibility layers, or speculative platform integrations.

## Backlog Contract

Task 1.2 SHALL create `BACKLOG.md` as the durable queue between archived OpenSpec changes. It is not an implementation checklist and MUST NOT duplicate active change tasks.

Each backlog item contains only:

- change name
- status: `candidate`, `ready`, `active`, `done`, or `blocked`
- outcome
- dependencies
- reason it is ordered next
- observable acceptance signal
- explicitly deferred scope

The backlog is ordered by dependency and architectural risk. Only an item whose dependencies are `done` may become `ready`; only one item may be `active`. Selecting an item creates or resumes its OpenSpec change, whose `tasks.md` becomes the sole implementation checklist. After sync and archive, the item becomes `done`, downstream readiness is recalculated, and discoveries may refine later items without rewriting completed history.

The initial backlog SHALL contain these outcomes after `initial-project-shape`:

1. `add-typed-namespace-loading`: Add typed loader registries, deepest-ancestor namespace resolution, concurrent-load deduplication, atomic registration, and explicit failure without fallback. Defer plugins and public domain factories. Acceptance: an internal typed registry loads a missing class deterministically and exposes no partial registration on failure.
2. `add-semantic-events`: Add registered EventClass definitions, closed-schema immutable JSON snapshots, EventFactory creation, EventInstance lifecycle, cleanup, and safe trace records. Defer listeners, relayers, browser adapters, and UI events. Acceptance: programmatic dispatch validates, runs, traces, and releases an event without live payload references.
3. `add-managed-listeners`: Add EventEndpoints, ListenerClass/ListenerInstance, public/private channels, onion middleware, explicit `false` short-circuiting, exceptions, and relayers as managed listeners. Defer browser-native sources. Acceptance: one endpoint relays a typed event to another with deterministic before/after ordering and complete cleanup.
4. `add-plugin-transactions`: Add PluginClass/PluginInstallation lifecycle, staged multi-registry contributions, atomic commit/rollback, protected uninstall, and explicit cascade. Defer live instance migration. Acceptance: a failing multi-registry install leaves every registry unchanged, while protected uninstall reports live dependents.
5. `add-component-runtime`: Add registered ComponentClass definitions, ComponentFactory, managed component instances, scopes, references, capabilities, and logical instance trees. Defer renderer and DOM behavior. Acceptance: two isolated runtime trees use the same definitions without ownership or reference collisions.
6. `add-template-render-plans`: Add registered template definitions, named slots and roots, deterministic resolution, normalized renderer-neutral render plans, and explanation APIs. Defer DOM rendering and dynamic hot replacement. Acceptance: a component instance resolves a multi-root plan and explains the selected template without renderer dependencies.
7. `add-render-root-projection`: Add renderer ports, RootHandles, permanent DOM identity attributes, managed commit repair, and a fake renderer. Defer layout scheduling and SolidJS. Acceptance: every fake-renderer root carries stable identity, managed commits repair removed attributes, and ownership never depends on DOM selectors.
8. `add-layout-coordination`: Add handle-only layout contracts, invalidation, and deterministic synchronous measure/calculate/apply phases. Depend on render-root projection and defer advanced layout strategies. Acceptance: layout accepts only owner-validated RootHandles, preserves phase order, and rejects asynchronous synchronous-phase hooks.
9. `add-solid-adapter-prototype`: Add the first SolidJS/browser adapter, native input snapshot boundary, reactive mount/unmount, and deterministic disposal. Depend on template render plans and render-root projection; defer reusable UI breadth. Acceptance: one component mounts, reacts, emits a semantic event, and unmounts without leaving listeners or reactive effects.
10. `validate-two-editor-scenario`: Add the minimal Panel, TextField, Button, Dialog, Stack layout, and a two-editor validation application. Depend on layout coordination and the Solid adapter; defer advanced components and platform integrations. Acceptance: two editors coexist without collisions, template changes preserve business events, and destroying one cancels only its owned work.

The cycle for each ready item is:

```text
explore when needed
→ propose
→ adversarial proposal review
→ apply in coherent milestones
→ targeted verification and adversarial apply review
→ full Definition of Done
→ sync
→ archive
→ final review
→ update backlog
```

The backlog does not authorize destructive actions, external credentials, unreviewed dependency adoption, or resolution of material product ambiguity without user direction.

## Decisions

### Use npm workspaces for the initial repository shape

The existing repository already documents root `npm` commands and contains a private root `package.json`. npm workspaces and a committed `package-lock.json` establish the smallest package-management surface without adding an orchestration tool before the package graph requires one.

The workspace supports maintained Node.js lines accepted by the selected quality toolchain: `^20.19.0 || ^22.13.0 || >=24.0.0`. Package metadata enforces the same range.

The initial layout contains only `packages/core`. Future renderer and UI packages are added by later OpenSpec changes when they have real contracts.

Alternatives considered:

- pnpm workspaces provide stronger monorepo ergonomics, but selecting them now would add policy and tooling not required by a single-package first slice.
- A flat package would reduce initial files but would make the framework-independent core boundary harder to preserve when the first renderer adapter arrives.

### Separate readable runtime IDs from opaque ownership identities

A readable runtime ID is used in qualified IDs, errors, and diagnostics. It is not an authority token and does not have to be process-global. Each runtime also receives an opaque identity used for all ownership checks. Two runtimes with equal readable IDs remain isolated.

This prevents string equality or forged diagnostic identifiers from granting access to managed objects.

### Model managed objects with one lifecycle kernel

Registrations and factory-created objects share the same lifecycle and resource stack. The implementation owns state transitions and reverse-order cleanup. Released objects retain a small immutable tombstone but no active capabilities or managed-object references.

Release attempts every cleanup even when an earlier cleanup fails. The object still reaches the released state, while a stable managed release error aggregates all cleanup failures. Repeated release never repeats side effects and preserves the same failure for inspection and callers.

Definitions are deliberately excluded: they are immutable, portable descriptions and are not owned by a runtime until registered.

### Keep public registries typed while sharing an internal kernel

The target public architecture exposes kind-specific registries and factories only when their domains are introduced. This first change implements a generic internal registration kernel and exercises it with private test kinds rather than publishing generic, Event, or Component registration APIs.

The initial package exports runtime creation, readable runtime identity, ownership-safe handles, lifecycle status, release behavior, and diagnostic errors/tombstones. Registration kernels, definition helpers, test kinds, and the factory proof remain outside the package export map until a later domain change defines a real public consumer.

Canonical identity is constructed in stages:

```text
local slug             sample.item
canonical class ID     alpha/sample.item
qualified registration admin::alpha/sample.item
```

Kind-specific definition helpers add the kind prefix automatically. Runtime registration adds the runtime prefix. Duplicate active IDs and kind mismatches fail; there is no last-write-wins behavior.

### Require explicit replacement and runtime-assigned revisions

Definitions do not carry manual version fields. Explicit replacement creates a new registration revision assigned by the owning runtime. This separates contract identity from runtime replacement history and avoids conflicting version sources.

Replacement and unregister use a protected policy in this first change: either operation fails without mutation while the active registration has live dependent instances. Live migration and cascade replacement remain deferred.

### Make factories the only managed-instance creation boundary

A factory resolves or receives an active registration, validates ownership, allocates identity, initializes lifecycle, and only then calls definition-specific creation behavior. Constructors and helpers that could produce a valid but unmanaged instance remain internal.

Factory creation is transactional with respect to publication. If definition-specific creation behavior fails, the factory runs every initialized resource cleanup in reverse order, never publishes the temporary instance, and reports a creation error containing the original cause plus any cleanup failures.

This first change proves the factory envelope with an internal test object. Domain factories are introduced with their corresponding typed registries in later changes.

### Keep dependencies acyclic

The initial dependency direction is:

```text
Runtime facade
    ↓
Typed registration kernel
    ↓
Ownership and lifecycle kernel
    ↓
Shared identity and error primitives
```

The runtime facade is a composition root only. Domain logic must not accumulate there.

## Risks / Trade-offs

- **npm workspaces may become insufficient for a larger package graph** → Reassess through a later OpenSpec change when a concrete orchestration need appears; do not add speculative tooling now.
- **A generic registration kernel may overfit the first test kind** → Keep the public surface typed and minimal; add Event and Component facades only when their real consumers exist.
- **Diagnostic tombstones can accidentally retain resources** → Test released objects through weakly coupled resource probes and expose only immutable scalar identity/status fields.
- **Readable runtime IDs can appear globally unique even when they are not** → Document that opaque ownership is authoritative and test equal-readable-ID runtimes explicitly.
- **Replacement revisions can imply unsupported live migration** → Limit replacement to registration resolution history; explicitly defer live dependent migration.
- **Cleanup or definition creation can fail after resources exist** → Attempt every registered cleanup, aggregate failures, preserve the original creation cause, and never publish a partially created instance.
- **The first change may absorb later architecture work** → Treat events, plugins, loaders, DOM, layout, and SolidJS as hard scope exclusions.

## Migration Plan

1. Replace placeholder project documentation and metadata.
2. Add the npm workspace, lockfile, core package, and root quality tooling.
3. Implement shared identity and error primitives.
4. Implement runtime ownership and managed lifecycle.
5. Implement the internal typed-registration kernel and factory envelope.
6. Add contract and isolation tests, then run every root Definition of Done command.

The repository has no prior source API or consumers, so no compatibility migration is required. Rollback consists of reverting this change before subsequent capabilities depend on the new contracts.

## Open Questions

- The exact public names for the first ownership and lifecycle types may be refined during implementation, but their specified behavior cannot change without updating the delta specs.
