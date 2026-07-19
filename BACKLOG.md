# Velkren Backlog

This file is the durable queue between archived OpenSpec changes. It records change-sized outcomes, not implementation tasks. The active change's `tasks.md` is the sole implementation checklist.

Statuses are `candidate`, `ready`, `active`, `done`, or `blocked`. Only an item whose dependencies are `done` can become `ready`, and only one item can be `active`.

## initial-project-shape

- **Status**: done
- **Outcome**: Establish the project contract, durable backlog, executable TypeScript workspace, runtime ownership and lifecycle contracts, and internal typed-registration/factory foundations.
- **Dependencies**: none
- **Why next**: Every later runtime domain depends on these ownership, lifecycle, and repository invariants.
- **Acceptance**: Root quality gates pass; two runtimes remain isolated; managed resources release deterministically; internal typed registration and factory contracts pass their specifications.
- **Deferred**: Namespace loading, semantic events, listeners, plugins, components, templates, renderer projection, layout, SolidJS, and reusable UI.

## add-typed-namespace-loading

- **Status**: done
- **Outcome**: Add typed loader registries, deepest-ancestor namespace resolution, concurrent-load deduplication, atomic registration, and explicit failure without fallback.
- **Dependencies**: `initial-project-shape`
- **Why next**: Autoloading must preserve typed registration and failure atomicity before public domain factories depend on it.
- **Acceptance**: An internal typed registry loads a missing class deterministically and exposes no partial registration on failure.
- **Deferred**: Plugins and public domain factories.

## add-semantic-events

- **Status**: done
- **Outcome**: Add registered EventClass definitions, closed-schema immutable JSON snapshots, EventFactory creation, EventInstance lifecycle, cleanup, and safe trace records.
- **Dependencies**: `add-typed-namespace-loading`
- **Why next**: Semantic events are the first domain that exercises registered definitions, managed factories, snapshots, and short-lived cleanup end to end.
- **Acceptance**: Programmatic dispatch validates, runs, traces, and releases an event without retaining live payload references.
- **Deferred**: Listeners, relayers, browser adapters, and UI events.

## add-managed-listeners

- **Status**: done
- **Outcome**: Add EventEndpoints, ListenerClass and ListenerInstance, public/private channels, onion middleware, explicit `false` short-circuiting, exceptions, and relayers as managed listeners.
- **Dependencies**: `add-semantic-events`
- **Why next**: Listener ownership and middleware ordering must be stable before plugins or component coordination use events.
- **Acceptance**: One endpoint relays a typed event to another with deterministic before/after ordering and complete cleanup.
- **Deferred**: Browser-native event sources.

## add-plugin-transactions

- **Status**: done
- **Outcome**: Add PluginClass and PluginInstallation lifecycle, staged multi-registry contributions, atomic commit and rollback, protected uninstall, and explicit cascade.
- **Dependencies**: `add-managed-listeners`
- **Why next**: Plugins must not expose partially installed event, listener, or later component capabilities.
- **Acceptance**: A failing multi-registry install leaves every registry unchanged, while protected uninstall reports live dependents.
- **Deferred**: Live instance migration.

## add-component-runtime

- **Status**: done
- **Outcome**: Add registered ComponentClass definitions, ComponentFactory, managed component instances, scopes, owner-validated references, and logical instance trees.
- **Dependencies**: `add-plugin-transactions`
- **Why next**: Components require stable ownership, registration, events, listeners, and plugin contribution semantics.
- **Acceptance**: Two isolated runtime trees use the same definitions without ownership or reference collisions.
- **Deferred**: Dynamic capability authority (`add-capability-authority`), renderer, and DOM behavior.

## add-capability-authority

- **Status**: done
- **Outcome**: Add a dynamic capability model over owner-validated references: explicit grant, scoped delegation, and standalone revocation with authority policy and audit.
- **Dependencies**: `add-component-runtime`
- **Why next**: References establish static owner-validated access first; dynamic grant/delegate/revoke authority must build on stable component scopes and references rather than being smuggled into their introduction.
- **Acceptance**: A reference is granted, delegated within a scope, and revoked without leaving a live holder able to operate the target.
- **Deferred**: Renderer, DOM, and cross-runtime capability sharing.

## add-template-render-plans

- **Status**: done
- **Outcome**: Add registered template definitions, named slots and roots, deterministic resolution, normalized renderer-neutral render plans, and explanation APIs.
- **Dependencies**: `add-component-runtime`
- **Why next**: Renderer adapters need stable, inspectable render plans rather than component-specific rendering internals.
- **Acceptance**: A component instance resolves a multi-root plan and explains the selected template without renderer dependencies.
- **Deferred**: DOM rendering and dynamic hot replacement.

## add-render-root-projection

- **Status**: done
- **Outcome**: Add renderer ports, RootHandles, permanent DOM identity attributes, managed commit repair, and a fake renderer.
- **Dependencies**: `add-template-render-plans`
- **Why next**: DOM projection must establish observable identity without becoming the runtime's ownership source.
- **Acceptance**: Every fake-renderer root carries stable identity, managed commits repair removed attributes, and ownership never depends on DOM selectors.
- **Deferred**: Layout scheduling and SolidJS.

## add-layout-coordination

- **Status**: done
- **Outcome**: Add handle-only layout contracts, invalidation, and deterministic synchronous measure, calculate, and apply phases.
- **Dependencies**: `add-render-root-projection`
- **Why next**: Layout needs stable RootHandles but must remain independently replaceable from renderer projection.
- **Acceptance**: Layout accepts only owner-validated RootHandles, preserves phase order, and rejects asynchronous synchronous-phase hooks.
- **Deferred**: Advanced layout strategies.

## add-solid-adapter-prototype

- **Status**: done
- **Outcome**: Add the first SolidJS/browser adapter, native input snapshot boundary, reactive mount and unmount, and deterministic disposal.
- **Dependencies**: `add-template-render-plans`, `add-render-root-projection`
- **Why next**: The first concrete renderer must prove core semantics remain renderer-independent.
- **Acceptance**: One component mounts, reacts, emits a semantic event, and unmounts without leaving listeners or reactive effects.
- **Deferred**: Reusable UI breadth.

## validate-two-editor-scenario

- **Status**: done
- **Outcome**: Add the minimal Panel, TextField, Button, Dialog, Stack layout, and a two-editor validation application.
- **Dependencies**: `add-layout-coordination`, `add-solid-adapter-prototype`
- **Why next**: A real multi-instance screen is the first end-to-end proof of isolation, binding, event, template, layout, rendering, and disposal semantics.
- **Acceptance**: Two editors coexist without collisions, template changes preserve business events, and destroying one cancels only its owned work.
- **Deferred**: Advanced components and platform integrations.

## add-neutral-interaction-port

- **Status**: done
- **Outcome**: Make `RendererPort` symmetric with a declarative `registerInteraction` operation and an interaction-binding domain mapping `(RootHandle, interaction-type)` to an `EventClass` and payload projection, so adapters capture interactions their own way and only immutable snapshots cross inward. Removed the two-editor DOM-selector/`addEventListener` bypass.
- **Dependencies**: `validate-two-editor-scenario`
- **Why next**: The input side of the port was still DOM-coupled; neutral coordination requires the port to carry interactions inward, not just render nodes outward.
- **Acceptance**: The fake renderer proves core input-neutrality in Node; interactions flow through the binding; ownership, duplicate-binding, and snapshot-boundary rules hold.
- **Deferred**: A second real adapter, mixed-framework trees, plugin-based renderer selection.

## fix-interaction-failure-channel

- **Status**: done
- **Outcome**: Correct the delivery-time "fails explicitly" contract, which was unsatisfiable on any real adapter (delivery runs in an event callback that swallows throws). Added an owned, observable, never-silent failure channel (`onFailure` observer; `globalThis.reportError` with a `console.error` fallback), liveness-gated, and made the fake renderer's interaction simulation faithful to real event-dispatch semantics.
- **Dependencies**: `add-neutral-interaction-port`
- **Why next**: The prior contract held only on the unfaithful fake; a second adapter (React) would have silently lost delivery-time failures.
- **Acceptance**: The four delivery-time failure reasons surface through the channel with no synchronous throw into the callback; a released binding surfaces nothing; the fake no longer propagates a delivery throw.
- **Deferred**: A richer default diagnostic sink than `reportError`/`console.error`.

## add-react-adapter

- **Status**: done
- **Outcome**: Add `@velkren/react-adapter`, a React `RendererPort` via `react-dom/client` with `flushSync` for the synchronous contract, identity stamped imperatively on the mounted node, and `registerInteraction` woven into React's event system through an adapter-owned registration map read at event time (surviving commit re-renders). A parallel React validation reproduces the two-editor guarantees.
- **Dependencies**: `fix-interaction-failure-channel`
- **Why next**: The declarative registration shape was designed for a reconciler framework but validated only on imperative SolidJS; React is the proof that core stays renderer-independent.
- **Acceptance**: The adapter satisfies the port with no `@velkren/core` change; two React editors isolate, emit business events through the binding, and dispose scope-locally; React stays confined to the adapter package.
- **Deferred**: Non-DOM-named interaction types, `RenderNode`→React prop translation beyond the validation set.

## extract-neutral-composition

- **Status**: done
- **Outcome**: Extract a renderer-agnostic component/template/event/layout composition and a common adapter test-drive surface (identity lookup, interaction simulation) so the _same_ composition can be mounted on any adapter with only the injected renderer swapped — the gold-standard neutrality proof.
- **Dependencies**: `add-react-adapter`
- **Why next**: The Solid and React validations are currently parallel proofs; a shared composition would prove the identical core composition runs unchanged across frameworks.
- **Acceptance**: One composition mounts on both the SolidJS and React adapters and passes the same isolation, emission, and disposal assertions.
- **Deferred**: Additional adapters.

## refactor-container-anchor

- **Status**: done
- **Outcome**: Relocate the identity attribute and interaction capture from the rendered root element onto the adapter-owned per-root container in both adapters; React's interaction capture changes from synthetic handler props to a native container listener. Behaviour-preserving at the port boundary.
- **Dependencies**: `add-react-adapter`
- **Why next**: A component's root view could not be a framework-native component while the runtime's identity/interaction anchor lived on the rendered element; moving the anchor to the container is the prerequisite for a root-capable view registry.
- **Acceptance**: Identity, commit-repair, interaction delivery, and two-editor isolation/disposal all hold with the anchor on the container; no `@velkren/core` change.
- **Deferred**: The view registry itself (`add-view-registry`).

## add-view-registry

- **Status**: done
- **Outcome**: Add an optional per-adapter view registry mapping a node `kind` to a framework-native view, consulted for every node including the root, falling back to primitives; a registered leaf view receives the node's attributes as props. Lets an app opt a component's view into its framework's UI library while `@velkren/core` stays neutral and ships no bindings.
- **Dependencies**: `refactor-container-anchor`
- **Why next**: Primitives-only rendering blocked using any existing UI-library component; the registry is the open seam (native views are a registration, primitives the default).
- **Acceptance**: A registered view renders in place of the primitive with attributes as props, including at the root, and its interaction bubbles to the container and delivers through the port; unregistered kinds fall back; core references no view type.
- **Deferred**: Native views holding Velkren-managed children (nesting); a typed view-props contract; per-node primitive-vs-view Solid update to preserve root focus.

## add-native-nested-views

- **Status**: candidate
- **Outcome**: Let a registered native view host Velkren-managed children (a native container with managed children inside), by mounting a child projection into the native component via a portal/ref with lifecycle coordination.
- **Dependencies**: `add-view-registry`
- **Why next**: The view registry is leaf-only; real UI (a native Dialog wrapping managed content) needs the native-parent / Velkren-child boundary.
- **Acceptance**: A registered native view hosts a managed child whose projection mounts inside it and releases with the parent, with no identity/interaction leakage.
- **Deferred**: Mixed-framework trees.

## add-typed-view-props

- **Status**: candidate
- **Outcome**: Promote the view props channel from the dual-use `attributes` to a distinct core view node (`{ viewId, props, slots }`) with a typed props contract, so view props are validated and separated from HTML attributes.
- **Dependencies**: `add-view-registry`
- **Why next**: Reusing `attributes` as props is untyped and semantically dual-use; a typed view node removes the ambiguity once the mechanism has proven out.
- **Acceptance**: A view node carries typed props distinct from primitive attributes; adapters consume it; core validates the props contract.
- **Deferred**: Native nesting.

## add-vue-adapter

- **Status**: candidate
- **Outcome**: Add a Vue `RendererPort` adapter, exercising the port on a third framework with a template/directive event model.
- **Dependencies**: `add-react-adapter`
- **Why next**: A third adapter further hardens the neutrality claim and the declarative-registration shape.
- **Acceptance**: The Vue adapter satisfies the port and passes the same validation guarantees with no `@velkren/core` change.
- **Deferred**: Mixed-framework trees.

## add-interaction-type-vocabulary

- **Status**: candidate
- **Outcome**: Replace the free `interaction-type` string with a registered, typed vocabulary (mirroring `EventClass`), so interaction types are validated and normalized across adapters.
- **Dependencies**: `add-react-adapter`
- **Why next**: With two adapters naming interactions, an unvalidated free string invites divergence.
- **Acceptance**: A typed interaction vocabulary is registered and resolved; adapters translate their native event names to it.
- **Deferred**: Non-DOM-named interaction escape hatches.
