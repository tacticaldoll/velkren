## Context

The archived foundation provides immutable typed definitions, runtime-owned typed registrations, synchronous deterministic lookup, protected replacement, and a central factory proof. Missing registrations still fail immediately. Future EventClass and other domain factories need an on-demand definition source, but global scanning, import-order registration, silent fallback, and partial contribution publication violate the project contract.

This change adds an internal loader proof only. It must remain runtime-isolated, kind-specific, Node.js-compatible, and absent from the public export map. The implementation may refine internal foundation modules where a batch-commit primitive or generic managed registration envelope is required, but it must not introduce a public domain API.

## Goals / Non-Goals

**Goals:**

- Register managed loader definitions by runtime, class kind, and validated dot-segment namespace.
- Select one loader deterministically through deepest-ancestor matching.
- Keep synchronous lookup pure and make loading an explicit asynchronous operation.
- Deduplicate only concurrent requests for the same canonical class.
- Validate and publish multi-definition contributions atomically.
- Fail explicitly without shallower fallback, partial registrations, leaked in-flight state, or cross-runtime mutation.
- Protect loader replacement and unregister while loads are in flight.

**Non-Goals:**

- Public loader, EventClass, ComponentClass, plugin, browser, renderer, layout, or UI APIs.
- Filesystem conventions, module URLs, dynamic `import()` policy, bundler integration, network transport, caching beyond in-flight deduplication, preload graphs, or hot reload.
- Automatic loading from synchronous `resolve()`, global namespace scanning, or fallback chains.
- Live migration of existing registrations or dependent instances.

## Decisions

### Keep loading separate from synchronous lookup

`TypedRegistry.resolve(classId)` remains a pure synchronous read. A new internal typed namespace resolver owns an explicit `load(classId)` operation that first returns an active registration if present and otherwise performs loader selection and loading.

This prevents inspection or ordinary lookup from triggering callbacks, I/O, or registry mutation. An alternative that autoloads from `resolve()` would either make the method asynchronous or hide side effects behind a read-shaped API; both weaken the existing contract.

### Model namespace as validated local-slug segments

A loader namespace is either the root namespace or a validated dot-separated prefix using the same segment grammar as local class slugs. A named namespace matches a slug when it is equal to the namespace or begins with `<namespace>.`. The selected loader is the match with the greatest segment depth; root has depth zero.

Namespace identity is derived by the framework from runtime ID, class kind, and normalized namespace. Callers do not handwrite a canonical loader ID. Equal readable IDs do not grant ownership because opaque runtime identity remains authoritative.

Alternatives using raw string prefix matching would make `app.edit` incorrectly own `app.editor`; glob patterns and regular expressions would make overlap precedence difficult to explain and validate.

### Select exactly once and never fall back

Each load attempt snapshots the deepest active matching loader before invoking user behavior. A thrown callback, invalid contribution, missing target, conflict, or loader release failure is attributed to that selected loader. The resolver never retries a shallower candidate within the same attempt.

This makes failures observable and local. Fallback would allow a broken specific loader to be silently masked by a broad loader and would make registration results depend on error paths.

### Deduplicate by requested canonical class

Each resolver is permanently paired with one typed class registry and keeps an in-flight map keyed by canonical class ID. The first caller creates the load promise; concurrent callers receive that same promise. A `finally` path removes only the matching promise, after either success or failure. Different class IDs use different entries even if they select the same loader. Separate typed registries remain separate resolution and publication boundaries even when they share a runtime and kind.

Deduplicating by namespace would unnecessarily serialize independent classes. Keeping fulfilled promises as a cache would duplicate the typed registry's authority and prevent retry after failure or loader replacement.

### Stage definitions, then commit through one registry transaction

Loader behavior returns an iterable materialized once into a finite array. It does not receive mutation access to the typed registry. The resolver validates the complete staged set before commit:

1. The selected loader is still active and owned by the resolver runtime.
2. Every item is an immutable class definition of the registry kind.
3. Every definition lies inside the selected namespace.
4. Canonical IDs are unique inside the contribution.
5. The requested canonical class is present.
6. No staged ID conflicts with an active registration.

The typed registry gains one internal batch-registration operation. It validates the whole batch before creating registrations, then creates managed registrations off-map and publishes all map entries in one synchronous commit section. If managed registration initialization unexpectedly fails, created registrations are released in reverse order and no map entry is published; one load error preserves initialization and cleanup failures. Runtime revisions are assigned only to a successfully committed batch, in deterministic contribution order.

Calling the existing one-at-a-time `register()` in a loop was rejected because a later conflict or initialization failure would expose a partial contribution.

### Treat loader registrations as managed resources

A typed loader registry owns loader registrations using the shared managed lifecycle. It tracks active in-flight counts per loader. Selection increments the selected loader before invoking behavior and decrements it in `finally`. Replacement and unregister use the same protected policy as class registrations: they reject without mutation while the count is nonzero.

Successful replacement creates a runtime-assigned loader revision and keeps the previous released revision identifiable through scalar diagnostics. Unregister removes the loader from future selection and releases its resources. Loader callbacks are cleared on release so archived handles do not retain behavior capabilities.

### Keep failure categories explicit and internal

Internal diagnostic errors distinguish no matching loader, duplicate loader namespace, loader kind or ownership mismatch, selected callback failure, invalid contribution, registration conflict, protected lifecycle mutation, and transactional cleanup failure. Errors include readable runtime, kind, namespace, requested class, and selected loader identity where relevant, but readable strings never authorize recovery or mutation.

These error classes remain internal with the loader kernel. Later public domain changes must deliberately map them into domain contracts rather than inheriting an accidental generic API.

### Preserve dependency direction

The internal dependency direction is:

```text
future domain factory
    ↓
typed namespace resolver and loader registry
    ↓
typed registration kernel
    ↓
ownership, lifecycle, identity, and error primitives
```

The runtime facade remains a composition root and does not accumulate loader algorithms. No DOM or renderer library is introduced.

## Risks / Trade-offs

- **A loader can return an unbounded or stateful iterable** → Materialize once with an explicit maximum contribution count and reject overflow before publication.
- **Two different class loads can stage overlapping contributions concurrently** → Batch commit revalidates active conflicts immediately before its synchronous publish section; one batch wins and the other fails without partial state.
- **A loader can be replaced while selection is starting** → Increment the selected loader's in-flight count synchronously before invoking behavior; protected mutations then reject.
- **Promise cleanup can delete a newer retry entry** → Remove an in-flight entry only when its stored promise is the promise reaching `finally`.
- **Revisions can be consumed by failed batches** → Reserve and assign class-registration revisions only inside the successful commit section.
- **Root loaders are broad and can hide missing namespace policy** → Root selection is explicit, lowest precedence, and never used as fallback after a named loader is selected.
- **Internal loader errors may become de facto public through tests** → Test behavior and diagnostic fields internally while keeping every loader symbol absent from the package export map.

## Migration Plan

1. Add namespace identity validation and matching helpers.
2. Add managed typed loader definitions, registrations, protected lifecycle operations, and selection.
3. Add atomic batch registration to the internal typed registry.
4. Add the explicit async resolver with per-class in-flight deduplication and failure cleanup.
5. Add contract, concurrency, rollback, lifecycle, public-boundary, and Node.js isolation tests.
6. Run the root Definition of Done and sync the new capability spec before archive.

Rollback is a normal revert of this change. The loader API is internal and no existing public consumer requires migration.

## Open Questions

- The initial maximum staged contribution count will be a conservative internal constant. A later domain may expose policy configuration only when a real consumer requires it.
- Cancellation and timeouts remain caller-side concerns until a domain loader has a concrete cancellation contract.
