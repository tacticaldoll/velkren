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
    expect(core).toHaveProperty("EventChannel");
    expect(core).toHaveProperty("ListenerLifecyclePhase");
    expect(core).toHaveProperty("createListenerClass");
    expect(core).toHaveProperty("createListenerMiddleware");
    expect(core).toHaveProperty("ListenerExecutionError");
    expect(core).toHaveProperty("ListenerCreationError");
    expect(core).toHaveProperty("RelayDepthError");
    expect(core).toHaveProperty("createPluginClass");
    expect(core).toHaveProperty("PluginLifecyclePhase");
    expect(core).toHaveProperty("PluginInstallationError");
    expect(core).toHaveProperty("PluginUninstallDependencyError");
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
    expect(core).not.toHaveProperty("ListenerRegistry");
    expect(core).not.toHaveProperty("createListenerFactory");
    expect(core).not.toHaveProperty("reactEndpoint");
    expect(core).not.toHaveProperty("resolveEndpointAuthority");
    expect(core).not.toHaveProperty("snapshotEndpointListeners");
    expect(core).not.toHaveProperty("installEndpointListener");
    expect(core).not.toHaveProperty("getEventRelayDepth");
    expect(core).not.toHaveProperty("createEventEndpoint");
    expect(core).not.toHaveProperty("PluginDomain");
    expect(core).not.toHaveProperty("stagePluginContributions");
    expect(core).not.toHaveProperty("PluginStagingLimits");
    expect(core).not.toHaveProperty("allocatePluginInstallationId");
    expect(core).not.toHaveProperty("RegistrationAdmissionError");
  });
});
