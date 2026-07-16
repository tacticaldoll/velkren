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

## add-reference-capability

- **Status**: ready
- **Outcome**: Extract a shared, owner-validated reference/capability primitive with framework provenance and a standard public (use-only) / private (control and release) split, so future domains consume one abstraction instead of re-implementing the pattern.
- **Dependencies**: `initial-project-shape`
- **Why next**: Every domain since semantic events has re-implemented the same owner-validated capability pattern (provenance WeakMap, ownership assertion, public/private handles); event-endpoint is the clearest instance. The component runtime would be the sixth hand-rolled copy. A shared primitive must exist before it, or the duplication compounds.
- **Acceptance**: Two runtimes each resolve a same-typed reference without cross-runtime leakage; the private handle can release while the public handle cannot; possession of a public reference exposes no private runtime capability. Existing event-endpoint semantics are used only as a second design consumer to pressure-test generality, without modifying its code.
- **Deferred**: Migrating existing event, listener, and plugin domains onto the primitive; Scope, which lands with the component runtime.

## add-component-runtime

- **Status**: candidate
- **Outcome**: Add registered ComponentClass definitions, ComponentFactory, managed component instances, logical instance trees, and Scope as the authority boundary layered along the tree. Components consume the shared reference/capability primitive rather than redefining it.
- **Dependencies**: `add-plugin-transactions`, `add-reference-capability`
- **Why next**: Components require stable ownership, registration, events, listeners, plugin contribution semantics, and a shared reference/capability primitive. Scope earns meaningful acceptance only against a real instance tree, so it lands here rather than in the primitive.
- **Acceptance**: Two isolated runtime trees use the same definitions without ownership or reference collisions, and a scope gates which references resolve within a subtree.
- **Deferred**: Renderer and DOM behavior.

## add-template-render-plans

- **Status**: candidate
- **Outcome**: Add registered template definitions, named slots and roots, deterministic resolution, normalized renderer-neutral render plans, and explanation APIs.
- **Dependencies**: `add-component-runtime`
- **Why next**: Renderer adapters need stable, inspectable render plans rather than component-specific rendering internals.
- **Acceptance**: A component instance resolves a multi-root plan and explains the selected template without renderer dependencies.
- **Deferred**: DOM rendering and dynamic hot replacement.

## add-render-root-projection

- **Status**: candidate
- **Outcome**: Add renderer ports, RootHandles, permanent DOM identity attributes, managed commit repair, and a fake renderer.
- **Dependencies**: `add-template-render-plans`
- **Why next**: DOM projection must establish observable identity without becoming the runtime's ownership source.
- **Acceptance**: Every fake-renderer root carries stable identity, managed commits repair removed attributes, and ownership never depends on DOM selectors.
- **Deferred**: Layout scheduling and SolidJS.

## add-layout-coordination

- **Status**: candidate
- **Outcome**: Add handle-only layout contracts, invalidation, and deterministic synchronous measure, calculate, and apply phases.
- **Dependencies**: `add-render-root-projection`
- **Why next**: Layout needs stable RootHandles but must remain independently replaceable from renderer projection.
- **Acceptance**: Layout accepts only owner-validated RootHandles, preserves phase order, and rejects asynchronous synchronous-phase hooks.
- **Deferred**: Advanced layout strategies.

## add-solid-adapter-prototype

- **Status**: candidate
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

## refactor-endpoint-onto-references

- **Status**: candidate
- **Outcome**: Re-implement event endpoint public/private capabilities on top of the shared reference/capability primitive, removing the endpoint-specific provenance WeakMaps and assertions.
- **Dependencies**: `add-reference-capability`
- **Why next**: Sequenced after `add-component-runtime` proves the primitive generalizes to a genuinely new domain; refactoring earlier risks reworking the primitive contract twice. Behavior-preserving, one domain at a time.
- **Acceptance**: The `managed-listeners` and `semantic-events` specs pass unchanged; endpoint provenance and public/private behavior are identical while the endpoint-local capability machinery is gone.
- **Deferred**: Listener and plugin migration.

## refactor-listener-onto-references

- **Status**: candidate
- **Outcome**: Migrate listener and relayer capabilities onto the shared reference/capability primitive, removing listener-specific hand-rolled provenance and handles.
- **Dependencies**: `add-reference-capability`, `refactor-endpoint-onto-references`
- **Why next**: Follows the endpoint migration so the two event-domain refactors converge on the same primitive usage. Behavior-preserving.
- **Acceptance**: The `managed-listeners` spec passes unchanged; middleware ordering, short-circuiting, and cleanup are identical with the primitive in place.
- **Deferred**: Plugin migration.

## refactor-plugin-onto-references

- **Status**: candidate
- **Outcome**: Migrate plugin installation capabilities onto the shared reference/capability primitive, removing plugin-specific hand-rolled provenance and handles.
- **Dependencies**: `add-reference-capability`, `refactor-listener-onto-references`
- **Why next**: Last of the staged migrations; by now the primitive is exercised by a new domain and two refactors, so plugin adoption carries the least contract risk. Behavior-preserving.
- **Acceptance**: The `plugin-transactions` spec passes unchanged; staged commit, rollback, protected uninstall, and cascade behavior are identical with the primitive in place.
- **Deferred**: Live instance migration.
