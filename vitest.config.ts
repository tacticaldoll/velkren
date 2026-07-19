import { defineConfig } from "vitest/config";

// SolidJS ships separate server and client builds selected by export
// conditions. Under Node, Vitest would otherwise resolve the server (SSR)
// build, whose reactivity is inert. Resolve the client build and inline
// solid-js so the adapter's reactive rendering behaves as in a browser.
// react/react-dom are inlined for the same ESM-interop reason (the React
// adapter uses `react-dom/client` + `flushSync`).
// Per-file test environments (e.g. happy-dom) are still set via docblocks;
// the core package's tests remain Node-only.
export default defineConfig({
  resolve: {
    conditions: ["browser", "development"],
  },
  test: {
    server: {
      deps: {
        inline: ["solid-js", "react", "react-dom", "vue"],
      },
    },
  },
});
