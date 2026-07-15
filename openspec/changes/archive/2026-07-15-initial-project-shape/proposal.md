## Why

Velkren is still a generic TypeScript/OpenSpec starter with no product contract, source layout, or executable quality gates. The project needs a small first runtime slice that establishes its identity, ownership, lifecycle, and registration invariants before higher-level event, component, renderer, and layout APIs are built on unstable foundations.

## What Changes

- Replace the starter metadata and placeholder project contract with Velkren's purpose, constitutional constraints, terminology, priorities, and explicit non-goals.
- Add a durable, dependency-ordered backlog of change-sized outcomes so completed OpenSpec changes can feed the next ready change without duplicating change-local tasks.
- Establish a TypeScript monorepo layout and package-management policy suitable for framework-independent core packages and future renderer adapters.
- Make build, test, lint, and format checks executable from the repository root.
- Introduce the first framework-independent runtime contracts for runtime identity, ownership validation, managed lifecycle, and diagnostic tombstones.
- Introduce an internal foundation for immutable class definitions, typed runtime-owned registrations, deterministic canonical identifiers, and central managed-instance creation without publishing premature domain registry APIs.
- Add tests proving that multiple runtimes remain isolated and that invalid cross-runtime operations fail before mutation.
- Defer semantic events, plugins, templates, layout scheduling, DOM projection, SolidJS integration, and UI components to later OpenSpec changes.

## Capabilities

### New Capabilities

- `runtime-ownership`: Runtime identity, ownership isolation, managed-object lifecycle, release behavior, and cross-runtime safety.
- `typed-registration`: Immutable typed definitions, canonical identifiers, runtime-local uniqueness, registrations, and central factory creation.

### Modified Capabilities

None.

## Impact

- Replaces placeholder content in `PROJECT.md`, `README.md`, and package metadata.
- Adds `BACKLOG.md` as the durable queue for future OpenSpec changes.
- Adds the initial monorepo/package layout, lockfile, TypeScript sources, tests, linting, and formatting configuration.
- Establishes the first public runtime identity, ownership, and lifecycle contracts under the framework-independent core package, plus internal typed-registration infrastructure for later domain APIs.
- Creates architectural constraints that all later event, plugin, component, template, layout, and renderer changes must preserve.
- Adds no browser, DOM, JSX, CSS, or SolidJS dependency to the core package.
