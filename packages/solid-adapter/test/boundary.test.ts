import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readPackage(relativeUrl: string): {
  name: string;
  dependencies?: Record<string, string>;
} {
  return JSON.parse(
    readFileSync(new URL(relativeUrl, import.meta.url), "utf8"),
  ) as { name: string; dependencies?: Record<string, string> };
}

const corePkg = readPackage("../../core/package.json");
const adapterPkg = readPackage("../package.json");

describe("adopt-narrowly boundary", () => {
  it("keeps @velkren/core free of runtime dependencies", () => {
    expect(corePkg.name).toBe("@velkren/core");
    expect(Object.keys(corePkg.dependencies ?? {})).toEqual([]);
  });

  it("keeps the dependency direction one-way (adapter -> core)", () => {
    const coreDeps = Object.keys(corePkg.dependencies ?? {});
    expect(coreDeps).not.toContain("@velkren/solid-adapter");
    expect(coreDeps).not.toContain("solid-js");

    const adapterDeps = adapterPkg.dependencies ?? {};
    expect(adapterDeps).toHaveProperty("@velkren/core");
    expect(adapterDeps).toHaveProperty("solid-js");
  });
});
