## Why

Velkren now has runtime-isolated event and listener registries, but applications still cannot install a cohesive extension without exposing partially registered capabilities or hand-writing rollback. Plugin transactions are the next dependency because components and later adapters need extension installation to be atomic, owner-validated, and cleanly removable.

## What Changes

- Add immutable helper-proven `PluginClass` definitions whose contribution callback stages event and listener definitions without mutating live registries.
- Add runtime-owned `PluginInstallation` instances with an internal installing phase and public active, disposing, and released lifecycle behavior built on the existing managed-resource contract.
- Add a transaction coordinator that validates every staged contribution, detects conflicts, commits across participating registries atomically, and rolls back all staged or committed work on failure.
- Add protected uninstall that rejects live registration dependents without mutation, plus an explicit cascade operation that releases plugin-owned listener instances before unregistering contributions in reverse commit order.
- Add immutable strict-JSON plugin lifecycle observation and aggregate errors for installation, rollback, uninstall, and cascade failures.
- Keep plugin discovery, remote packages, dependency solving, hot migration, components, renderers, browser globals, and arbitrary service containers out of scope.

## Capabilities

### New Capabilities

- `plugin-transactions`: PluginClass definition, transactional multi-registry installation, managed PluginInstallation ownership, protected uninstall, explicit cascade, lifecycle observation, and deterministic rollback.

### Modified Capabilities

None. Plugins compose the existing event and listener contracts without changing their externally observable requirements.

## Impact

- Extends the public `@velkren/core` runtime API with plugin definitions, installation handles, transaction errors, lifecycle records, and uninstall operations.
- Adds internal staging and commit adapters for the existing event and listener registries while keeping generic registries and transaction kernels out of the public export map.
- Adds no runtime dependency, package loader, DOM type, renderer primitive, component API, or browser integration.
