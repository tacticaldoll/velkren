import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("consumer-only boundary", () => {
  it("depends at runtime only on the public core package", () => {
    expect(pkg.name).toBe("@velkren/two-editor-validation");
    // The composition is renderer-agnostic: its source imports only core, so no
    // renderer adapter appears among its runtime dependencies.
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      "@velkren/core",
    ]);
  });

  it("uses a renderer adapter only as a test-only dependency", () => {
    // The Solid renderer drives the fixture's own test; it must never leak into
    // the composition's runtime dependency graph.
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
      "@velkren/solid-adapter",
    ]);
  });
});
