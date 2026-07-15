import { describe, expect, it } from "vitest";

import * as core from "../src/index.js";

describe("@velkren/core workspace", () => {
  it("loads the public entry point", () => {
    expect(core).toBeTypeOf("object");
  });

  it("does not expose internal registration or identity constructors", () => {
    expect(core).not.toHaveProperty("createCanonicalClassId");
    expect(core).not.toHaveProperty("createQualifiedRegistrationId");
    expect(core).not.toHaveProperty("createManagedInstanceId");
    expect(core).not.toHaveProperty("Runtime");
    expect(core).not.toHaveProperty("createDefinitionKind");
    expect(core).not.toHaveProperty("TypedRegistry");
    expect(core).not.toHaveProperty("ManagedFactory");
    expect(core).not.toHaveProperty("RegistrationError");
    expect(core).not.toHaveProperty("createLoaderKind");
    expect(core).not.toHaveProperty("TypedLoaderRegistry");
    expect(core).not.toHaveProperty("TypedNamespaceResolver");
    expect(core).not.toHaveProperty("NoMatchingLoaderError");
  });
});
