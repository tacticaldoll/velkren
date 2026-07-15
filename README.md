# Velkren

Velkren is an explicit, composable browser-side UI runtime for stateful application interfaces.

It provides framework-independent runtime semantics for definitions, managed instances, identity, scopes, state, bindings, semantic events, templates, layout, capabilities, plugins, lifecycle, and inspection. Rendering and browser integration are supplied by adapters; applications retain ownership of definitions, policies, services, and customization.

## Status

Velkren's initial foundation is complete: runtime ownership, managed lifecycle, internal typed-registration infrastructure, the repository layout, and executable quality gates are specified and implemented. The next ready change is typed namespace loading; higher-level runtime domains remain deferred to the dependency-ordered backlog.

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
