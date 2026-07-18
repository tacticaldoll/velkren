## Context

Velkren now has a component runtime: managed component instances, logical trees, scopes, and owner-validated references, composed onto the ownership / typed-registration / managed-lifecycle kernel. Renderer adapters are still deferred, and the backlog requires a stable, inspectable, renderer-neutral description of an instance's structure before any DOM projection exists.

Templates are that description. A `TemplateClass` binds to one ComponentClass and declares named roots and slots; resolving a template for a component instance yields a normalized `RenderPlan` of pure data. Template definitions are portable across runtimes; registrations, resolution, and plans are runtime-local. The core stays Node.js compatible with no DOM, renderer, or reactive dependency. Render plans are data, not behavior — the renderer adapter (a later change) consumes them.

## Goals / Non-Goals

**Goals:**

- Immutable helper-proven TemplateClass definitions with canonical `template/<slug>` identity, one bound ComponentClass, named roots, and named slots.
- A runtime-owned template domain reusing the typed-registration kernel, with at most one active template per bound ComponentClass and no last-write-wins.
- Deterministic resolution keyed by a component instance's ComponentClass, with explicit failure when unbound and ownership rejection for foreign instances.
- Deeply frozen, renderer-neutral render plans: named roots, an abstract node tree with strict-JSON attributes, and named slots resolved to references or static content.
- An explanation API returning immutable strict-JSON data with no live references.

**Non-Goals:**

- Real renderers, DOM nodes, JSX, CSS, reactive primitives, or browser adapters.
- Layout measurement or scheduling.
- Dynamic hot template replacement of live instances, template inheritance/composition graphs, and conditional/iterative template logic.
- Selector- or query-based template discovery.

## Decisions

### Compose a template domain onto the runtime, keyed by bound ComponentClass

`createTemplateRuntime(runtime)` creates one template domain per Runtime (a second fails explicitly). It owns a private typed registry of `template` definitions plus an index from bound ComponentClass ID to the active template registration. Registration validates the target ComponentClass ID shape and rejects a second active template for an already-bound class; it does not consult the component registry, so templates can be registered before or after their component class. Replacement uses the kernel's explicit replace path for a revisioned registration.

Alternative considered: resolve templates by structural matching or predicates over an instance. Rejected as implicit discovery; a single explicit class binding keeps resolution deterministic and explainable.

### Resolve deterministically from the instance's ComponentClass

`resolvePlan(instance)` validates same-runtime ownership, reads `instance.classId`, and looks up the single active template bound to that class. No binding is an explicit `TemplateResolutionError`, never a silent empty plan. Exactly one active template per class means resolution needs no tie-breaking, which is what makes it deterministic and explainable.

### Normalize plans to frozen, renderer-neutral data

A `RenderPlan` is a deeply frozen record: `templateId`, `instanceId`, and an ordered map of named roots. Each root is a `RenderNode` tree — `{ kind: string, attributes: JsonObject, children: RenderNode[], slots: Record<string, ResolvedSlot> }` — all frozen. Attributes are validated as strict JSON (reusing the existing strict-JSON boundary); a non-JSON attribute fails resolution with the offending node/attribute path. The plan holds no DOM, renderer, function, or live-collection values, so a later renderer adapter is a pure consumer.

Alternative considered: let templates emit renderer-specific nodes. Rejected — it would pull renderer types into the core contract, violating the framework-independence invariant.

### Resolve slots to references or static content, never live instances

Each declared slot resolves to a `ResolvedSlot` that is either an owner-validated child `Reference` (validated on entry, exactly as scopes validate references) or renderer-neutral static content (strict-JSON). Every declared slot must resolve exactly once: an unknown slot name, a duplicate fill, and an unfilled required slot all fail before a partial plan is produced. Slots expose references, not live instances, so a plan never becomes a back door to a component's private surface.

### Keep explanation as immutable scalar data

`explainPlan(instance)` returns immutable strict-JSON: selected template ID (or a "no template bound" marker), the bound ComponentClass ID, and the resolved root and slot names. It never throws for an unbound instance and never retains live instances, references, registrations, or renderer objects — matching the trace/lifecycle-record discipline of the event and plugin domains.

## Risks / Trade-offs

- **A plan could smuggle in renderer or live objects** → Validate attributes as strict JSON, resolve slots to references or JSON only, and deeply freeze every plan node; reject anything else during resolution.
- **Ambiguous template selection** → Enforce one active template per bound ComponentClass at registration so resolution never tie-breaks.
- **Foreign-runtime instance or reference in a slot** → Validate opaque ownership before resolution and on every slot reference, matching the ownership-isolation invariant.
- **Partial plans on slot errors** → Validate the full slot set before constructing the plan; never expose a partially resolved plan.
- **Binding to a class that is never registered** → Allowed by design (templates are portable); resolution still fails explicitly for instances that cannot exist, and explanation reports the binding without a live component.

## Migration Plan

1. Add TemplateClass definitions, render-node/plan and explanation types, and template-domain errors without changing existing domains.
2. Add the template registry and bound-class index over the typed-registration kernel, with duplicate-binding and replacement tests.
3. Add deterministic resolution and strict-JSON-validated, deeply frozen multi-root plan construction.
4. Add slot resolution (reference/static content) with unknown/duplicate/unfilled rejection and ownership validation.
5. Add the explanation API and compose the template domain into the runtime with a narrow public facade.
6. Run the full existing suites to prove component, event, listener, and plugin behavior is unchanged.

Rollback removes the template facade and registry; all prior domains remain source-compatible because templates only consume their current contracts.

## Open Questions

- Whether roots should later carry ordering/priority metadata for multi-root layout; deferred until the layout change defines its needs.
- Whether static slot content needs a richer typed model than strict JSON; deferred until a concrete renderer adapter demonstrates a need.
