## 1. Validation Package

- [ ] 1.1 Add the `packages/two-editor-validation` (`@velkren/two-editor-validation`) package depending on `@velkren/core` and `@velkren/solid-adapter`, with a TypeScript project reference and a package-scoped browser-like test environment.
- [ ] 1.2 Add a test asserting the package consumes only public core and adapter contracts (no generic kernel imports).

## 2. Minimal Components and Layout

- [ ] 2.1 Define Panel, TextField, Button, and Dialog ComponentClasses with registered templates built from public contracts.
- [ ] 2.2 Define a Stack layout contract using the layout coordinator's synchronous phases.
- [ ] 2.3 Add tests that each component creates, templates, and lays out through the public API.

## 3. Two-Editor Assembly

- [ ] 3.1 Assemble two editor instances (Panel + TextField + Button), each with its own scope and owner-validated references, projected through the SolidJS adapter into a DOM surface.
- [ ] 3.2 Wire Button activation to dispatch a business semantic event through an EventRuntime, with a listener recording emissions per editor.
- [ ] 3.3 Add tests proving distinct identities/references, no cross-scope resolution, and isolated interaction between the two editors.

## 4. Template Resilience and Scoped Disposal

- [ ] 4.1 Add a test replacing an editor's template and asserting the Button still emits the same business semantic event and the adapter renders the new template.
- [ ] 4.2 Add a test destroying one editor and asserting only its instances, roots, layout bindings, and listeners are released while the other editor still renders, reacts, and emits.
- [ ] 4.3 Add the full end-to-end lifecycle test (mount, react, emit, re-template, dispose one editor) with no leaked effects or listeners.

## 5. Verification

- [ ] 5.1 Run the validation package's Definition of Done and the core and adapter Definitions of Done; run `openspec validate --all`; resolve every failure, recording any domain defect for a separate change.
- [ ] 5.2 Perform adversarial review against project invariants, delta and living specs, editor isolation (identity/reference/scope), template-change event preservation, scoped disposal without over- or under-reach, no-leak disposal, consumer-only boundary, and browser-only scope before sync and archive.
