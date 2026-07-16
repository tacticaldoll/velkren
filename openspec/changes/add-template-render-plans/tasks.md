## 1. Template Definitions and Domain Types

- [ ] 1.1 Add template identity allocation, render-node/render-plan and explanation types, and template-domain error types.
- [ ] 1.2 Implement helper-proven immutable `TemplateClass` definitions with canonical `template/<slug>` identity, one bound ComponentClass ID, at least one named root, and named slots, rejecting blank roots and malformed bound-class IDs.
- [ ] 1.3 Add tests for canonical identity, mutation resistance, forged/mutable-definition rejection, missing-root rejection, and cross-runtime reuse.

## 2. Registration and Bound-Class Uniqueness

- [ ] 2.1 Add a runtime-owned template registry over the typed-registration kernel with a bound-ComponentClass index and owner-validated registration handles.
- [ ] 2.2 Enforce at most one active template per bound ComponentClass, rejecting duplicate bindings without last-write-wins, and implement explicit revisioned replacement.
- [ ] 2.3 Add tests for duplicate-binding rejection, independent bindings across runtimes, and explicit replacement with a greater revision.

## 3. Deterministic Resolution and Render Plans

- [ ] 3.1 Implement `resolvePlan(instance)` with same-runtime ownership validation, ComponentClass-keyed lookup, and explicit failure when no template is bound.
- [ ] 3.2 Build deeply frozen multi-root render plans with abstract render-node trees and strict-JSON-validated attributes, rejecting non-JSON attribute values with a node/attribute path.
- [ ] 3.3 Add tests for bound resolution, no-binding failure, foreign-instance ownership rejection, multi-root plans, plan immutability, and strict-JSON attribute rejection.

## 4. Slot Resolution and Explanation

- [ ] 4.1 Implement named slot resolution to owner-validated child references or renderer-neutral static content, rejecting unknown, duplicate, and unfilled required slots before producing a plan, and never exposing a live instance.
- [ ] 4.2 Implement the `explainPlan(instance)` explanation API returning immutable strict-JSON identity, bound class, and resolved root/slot names without live references, and not throwing for unbound instances.
- [ ] 4.3 Add tests for filled slots, unknown/duplicate/unfilled slot rejection, reference-not-instance exposure, and explanation of selected and unresolved instances.

## 5. Public Facade and Verification

- [ ] 5.1 Compose one template domain into the runtime and add frozen public delegates for defining, registering, replacing, resolving, and explaining templates without changing existing component/event/listener/plugin behavior.
- [ ] 5.2 Add intentional public exports for TemplateClass, the template domain, render-plan and render-node contracts, explanation output, and template errors while proving generic registries, factory kernels, resolution internals, and deferred renderer/DOM/layout APIs remain unavailable.
- [ ] 5.3 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, and `openspec validate --all`; resolve every failure.
- [ ] 5.4 Perform adversarial review against project invariants, delta and living specs, ownership forgery, foreign-instance/reference rejection, ambiguous binding, non-JSON attributes, slot errors, plan immutability and renderer-neutrality, explanation retention, public exports, and Node.js isolation before sync and archive.
