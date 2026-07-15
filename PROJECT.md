# Velkren Project Contract

## Purpose

Velkren is an explicit, composable browser-side UI runtime for stateful application interfaces. It owns runtime semantics for definitions, managed instances, identity, scopes, state, bindings, semantic events, templates, layout, capabilities, plugins, lifecycle, and inspection.

Rendering and browser integration are provided through adapters. Applications own their definitions, policies, services, and customization.

## Constitutional Invariants

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

## Terminology

- **Runtime**: One isolated owner and composition boundary for registrations, scopes, managed instances, and resources.
- **Definition**: An immutable, portable description that is not owned by a runtime until registered.
- **Registration**: A runtime-owned association between a typed canonical class ID and a definition.
- **Managed instance**: A factory-created, runtime-owned object with identity, lifecycle, capabilities, and cleanup obligations.
- **Scope**: An explicit authority boundary that controls which references, services, and event endpoints are available.
- **Reference**: An owner-validated capability for interacting with a managed instance or endpoint; possession does not expose private runtime capabilities.
- **Projection**: Renderer or DOM output derived from runtime state; it is observable but not authoritative.
- **Adapter**: A replaceable integration that connects core contracts to a renderer, browser API, or another external mechanism.

## Priorities

When changes compete, prefer them in this order:

1. Ownership safety, lifecycle correctness, data integrity, and deterministic cleanup.
2. Explicit, inspectable runtime semantics and conformance with accepted OpenSpec requirements.
3. Small public interfaces and framework-independent composition.
4. Developer and operator ergonomics.
5. Optional integrations, scale-out behavior, and convenience abstractions.

Enabling work does not automatically authorize adjacent feature scope. Each new domain earns its public API through a separate OpenSpec change.

## Product Non-Goals

- Velkren is not a compatibility implementation or migration target for another UI framework.
- Velkren is not a full-stack application framework and does not own routing, server rendering, data fetching, authentication, build tooling, deployment, or backend architecture.
- Velkren does not use DOM selectors or global component queries as an application coordination API.
- Velkren does not expose renderer-native reactive objects as its public state or lifecycle model.
- Velkren does not rely on automatic scanning, import-order overrides, global mutable registries, deep inheritance, or prototype patching.
- Initial changes do not implement advanced UI components, remote component protocols, visual designers, broad compatibility layers, or speculative platform integrations.
