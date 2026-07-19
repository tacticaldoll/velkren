# Velkren

Velkren is an explicit, composable browser-side UI runtime for stateful application interfaces.

It provides framework-independent runtime semantics for definitions, managed instances, identity, scopes, state, bindings, semantic events, templates, layout, capabilities, plugins, lifecycle, and inspection. Rendering and browser integration are supplied by adapters; applications retain ownership of definitions, policies, services, and customization.

## Status

Velkren's runtime foundation, typed namespace loading, semantic events, managed endpoints, listeners, middleware, relayers, plugin transactions, the component runtime, template render plans, render-root projection, layout coordination, dynamic capability authority, the SolidJS and React renderer adapters, the end-to-end two-editor validation (proven renderer-agnostic across both adapters), the neutral interaction port, the observable interaction failure channel, per-root container anchoring of identity and interaction, and an adapter view registry (opt a component's view into a framework-native UI-library component while the core stays neutral) are specified and implemented. No OpenSpec change is currently active; the backlog carries candidate follow-ups (native views hosting managed children, a typed view-props contract, a Vue adapter, and a typed interaction-type vocabulary).

See:

- [`PROJECT.md`](PROJECT.md) for the project contract and terminology.
- [`BACKLOG.md`](BACKLOG.md) for dependency-ordered future changes.
- [`openspec/`](openspec/) for living specifications and active changes.
- [`docs/development-flow.md`](docs/development-flow.md) for the contribution lifecycle.

## Development

Velkren follows the OpenSpec lifecycle:

```text
explore → propose → apply → sync → archive
```

Do not add feature code without an active change containing implementation tasks. The root Definition of Done is:

```bash
npm run build
npm test
npm run lint
npm run format:check
```

## License

Licensed under either [Apache-2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT), at your option.
