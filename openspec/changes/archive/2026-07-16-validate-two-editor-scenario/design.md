## Context

All runtime domains through the SolidJS adapter are implemented and unit-tested in isolation. This change adds no new domain; it composes the whole stack into a real multi-instance screen — two editors — to prove the integration holds. It is the final backlog item and doubles as the executable end-to-end acceptance.

It lives in a new validation package `@velkren/two-editor-validation` depending on `@velkren/core` and `@velkren/solid-adapter`. The package ships no public runtime API; its value is its browser-like test suite. If the scenario reveals a defect, the fix is a separate change against the responsible domain — this package stays a consumer.

## Goals / Non-Goals

**Goals:**

- Minimal Panel/TextField/Button/Dialog ComponentClasses with templates and a Stack layout contract, built only from public core + adapter contracts.
- A two-editor assembly with per-editor scopes and references, projected through the SolidJS adapter.
- Executable proof of isolation, template resilience, and scoped disposal matching the backlog acceptance.

**Non-Goals:**

- A reusable UI component library or design system.
- Real application features (routing, persistence, forms framework), platform integration, or SSR.
- Any change to core or the adapter; the package is a pure consumer.

## Decisions

### Build the components as scenario fixtures, not a UI library

Panel/TextField/Button/Dialog are `createComponentClass` definitions whose `create` behavior returns a small value object, each bound to a registered `TemplateClass` that yields the render node for the SolidJS adapter. They are exported only within the package for its tests, never as a public UI API — respecting the non-goal against a reusable component library while satisfying the backlog's "minimal components".

### Assemble two editors with independent scopes

Each editor is a Panel instance with attached TextField and Button children (component trees), given its own `Scope` carrying owner-validated references to its own children. The two editors are built from the same ComponentClasses/templates but produce distinct instances and references, proving definitions are portable while instances are isolated. A Button activation dispatches a business semantic event through an `EventRuntime`; a listener records it so tests can assert isolation.

### Prove template resilience via explicit replacement

Re-templating uses the template domain's explicit `replace` for the editor's bound ComponentClass. The business event wiring lives on the component/listener side, not the template, so replacing the template and re-projecting must leave the Button's business event intact. The test replaces the template, activates the Button, and asserts the same semantic event still fires and the adapter renders the new node.

### Prove scoped disposal by releasing one editor's root component

Destroying an editor releases its root Panel instance, which cascades to its children (component tree release), and releases its projection roots and layout bindings; the SolidJS adapter disposes the reactive scope and DOM listeners for those roots. The surviving editor's instances, roots, bindings, and listeners are untouched. The test destroys editor one and asserts editor two still renders, reacts, and emits, with no leaked effects or listeners from editor one.

### Test in a package-scoped browser-like environment

The package uses a happy-dom test environment (per-file docblock) and the repo's SolidJS-client Vitest resolution, mounting real DOM through the adapter. The core package's Node-only environment is unchanged.

## Risks / Trade-offs

- **The scenario papers over a domain defect** → Keep the package a pure consumer; on failure, fix the responsible domain in a separate change rather than patching the scenario.
- **Editors leaking into each other** → Give each editor its own scope and references; assert cross-resolution fails and interactions stay isolated.
- **Template replacement dropping event wiring** → Keep business events on the component/listener side, independent of templates; assert the event survives re-templating.
- **Disposal over- or under-reaching** → Release one editor's root and assert both the released side is fully torn down and the surviving side is untouched.

## Migration Plan

1. Add the `packages/two-editor-validation` package (deps on core + adapter, browser-like test env, project reference).
2. Define the minimal components, their templates, and the Stack layout contract from public contracts.
3. Assemble the two-editor application with per-editor scopes, references, projection, and business-event wiring.
4. Add tests for isolation, template resilience, and scoped disposal, plus the full end-to-end lifecycle.
5. Run each package's Definition of Done and `openspec validate --all`; if a failure exposes a domain defect, record it for a separate change.

Rollback deletes the package; nothing depends on it.

## Open Questions

- Whether any integration defect surfaces that requires a follow-up change against a specific domain — recorded during apply, fixed separately.
- Whether the Dialog fixture needs interaction beyond mount/dispose for this scenario, or only presence; decided during implementation to keep the scenario minimal.
