import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { name: string; dependencies?: Record<string, string> };

describe("consumer-only boundary", () => {
  it("depends only on the public core and adapter packages", () => {
    expect(pkg.name).toBe("@velkren/two-editor-validation");
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      "@velkren/core",
      "@velkren/solid-adapter",
    ]);
  });
});
