import type { ManagedInstanceId } from "./identity.js";
import type { ManagedStatus, ManagedTombstone } from "./managed-lifecycle.js";
import type { RuntimeOwned } from "./runtime.js";
import type { JsonObject } from "./strict-json.js";
import type { RenderNode } from "./template-class.js";

/** An opaque renderer-owned root handle. Core never inspects its shape. */
export type AdapterRoot = unknown;

/** A removable interaction registration returned by the port. */
export interface InteractionRegistration {
  remove(): void;
}

/**
 * The framework-independent contract a renderer adapter implements. Core drives
 * it with renderer-neutral render nodes and a runtime-assigned identity token
 * and never imports DOM, JSX, renderer, or reactive-library types.
 */
export interface RendererPort {
  createRoot(identity: string, node: RenderNode): AdapterRoot;
  commit(root: AdapterRoot, identity: string, node: RenderNode): void;
  readIdentity(root: AdapterRoot): string | undefined;
  removeRoot(root: AdapterRoot): void;
  /**
   * Declare interest in a named interaction type on an adapter root. The adapter
   * wires capture however its framework prefers and invokes `deliver` with an
   * immutable snapshot; no DOM node or native event ever crosses inward.
   */
  registerInteraction(
    root: AdapterRoot,
    type: string,
    deliver: (snapshot: JsonObject) => void,
  ): InteractionRegistration;
}

/** The permanent attribute key under which a root's identity is projected. */
export const PROJECTION_IDENTITY_ATTRIBUTE = "data-velkren-root";

/** A runtime-owned managed projection of one named render-plan root. */
export interface RootHandle extends RuntimeOwned {
  readonly id: ManagedInstanceId;
  readonly rootName: string;
  readonly identity: string;
  readonly status: ManagedStatus;
  readonly tombstone: ManagedTombstone | undefined;
  assertActive(operation: string): void;
  release(): Promise<void>;
}

/** A runtime-owned managed projection of a component instance's render plan. */
export interface Projection extends RuntimeOwned {
  readonly id: ManagedInstanceId;
  readonly instanceId: ManagedInstanceId;
  readonly roots: Readonly<Record<string, RootHandle>>;
  readonly status: ManagedStatus;
  release(): Promise<void>;
}

export class InvalidRendererPortError extends TypeError {
  constructor(readonly reason: string) {
    super(`Invalid renderer port: ${reason}.`);
    this.name = "InvalidRendererPortError";
  }
}

export class ProjectionError extends Error {
  constructor(readonly reason: string) {
    super(`Render root projection failed: ${reason}.`);
    this.name = "ProjectionError";
  }
}

const PORT_OPERATIONS = [
  "createRoot",
  "commit",
  "readIdentity",
  "removeRoot",
  "registerInteraction",
] as const;

/** Validate that a value implements every RendererPort operation. */
export function assertRendererPort(
  value: unknown,
): asserts value is RendererPort {
  if (typeof value !== "object" || value === null) {
    throw new InvalidRendererPortError("renderer is not an object");
  }
  for (const operation of PORT_OPERATIONS) {
    if (typeof (value as Record<string, unknown>)[operation] !== "function") {
      throw new InvalidRendererPortError(
        `renderer is missing operation ${JSON.stringify(operation)}`,
      );
    }
  }
}
