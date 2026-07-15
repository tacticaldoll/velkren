import { describe, expect, it } from "vitest";

import * as core from "../src/index.js";

describe("@velkren/core workspace", () => {
  it("loads the public entry point", () => {
    expect(core).toBeTypeOf("object");
    expect(core).toHaveProperty("createEventRuntime");
    expect(core).toHaveProperty("createEventClass");
    expect(core).toHaveProperty("createEventLoader");
    expect(core).toHaveProperty("eventField");
    expect(core).toHaveProperty("optionalEventField");
    expect(core).toHaveProperty("EventPhase");
    expect(core).toHaveProperty("EventDispatchError");
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
    expect(core).not.toHaveProperty("EventDispatcher");
    expect(core).not.toHaveProperty("EventTraceBuilder");
    expect(core).not.toHaveProperty("noopEventTraceSink");
    expect(core).not.toHaveProperty("setEventPhase");
    expect(core).not.toHaveProperty("getEventSnapshotText");
    expect(core).not.toHaveProperty("createJsonSnapshot");
    expect(core).not.toHaveProperty("ListenerClass");
    expect(core).not.toHaveProperty("EventEndpoint");
    expect(core).not.toHaveProperty("middleware");
    expect(core).not.toHaveProperty("relayer");
  });
});
