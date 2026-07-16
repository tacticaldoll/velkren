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

- **Status**: ready
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

- **Status**: ready
- **Outcome**: Add handle-only layout contracts, invalidation, and deterministic synchronous measure, calculate, and apply phases.
- **Dependencies**: `add-render-root-projection`
- **Why next**: Layout needs stable RootHandles but must remain independently replaceable from renderer projection.
- **Acceptance**: Layout accepts only owner-validated RootHandles, preserves phase order, and rejects asynchronous synchronous-phase hooks.
- **Deferred**: Advanced layout strategies.

## add-solid-adapter-prototype

- **Status**: ready
- **Outcome**: Add the first SolidJS/browser adapter, native input snapshot boundary, reactive mount and unmount, and deterministic disposal.
- **Dependencies**: `add-template-render-plans`, `add-render-root-projection`
- **Why next**: The first concrete renderer must prove core semantics remain renderer-independent.
- **Acceptance**: One component mounts, reacts, emits a semantic event, and unmounts without leaving listeners or reactive effects.
- **Deferred**: Reusable UI breadth.

## validate-two-editor-scenario

- **Status**: candidate
- **Outcome**: Add the minimal Panel, TextField, Button, Dialog, Stack layout, and a two-editor validation application.
- **Dependencies**: `add-layout-coordination`, `add-solid-adapter-prototype`
- **Why next**: A real multi-instance screen is the first end-to-end proof of isolation, binding, event, template, layout, rendering, and disposal semantics.
- **Acceptance**: Two editors coexist without collisions, template changes preserve business events, and destroying one cancels only its owned work.
- **Deferred**: Advanced components and platform integrations.
