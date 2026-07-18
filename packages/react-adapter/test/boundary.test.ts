import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { assertRendererPort } from "@velkren/core";

import { createReactRenderer } from "../src/index.js";

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
    expect(coreDeps).not.toContain("@velkren/react-adapter");
    expect(coreDeps).not.toContain("react");
    expect(coreDeps).not.toContain("react-dom");

    const adapterDeps = adapterPkg.dependencies ?? {};
    expect(adapterDeps).toHaveProperty("@velkren/core");
    expect(adapterDeps).toHaveProperty("react");
    expect(adapterDeps).toHaveProperty("react-dom");
  });

  it("exposes a renderer that satisfies the RendererPort contract", () => {
    // No DOM needed: the port shape is present the instant the renderer is
    // created, so the assertion holds in the core's Node-only environment too.
    expect(() => assertRendererPort(createReactRenderer())).not.toThrow();
  });
});
