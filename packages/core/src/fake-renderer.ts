import {
  PROJECTION_IDENTITY_ATTRIBUTE,
  type AdapterRoot,
  type InteractionRegistration,
  type RendererPort,
} from "./renderer-port.js";
import type { JsonObject, JsonValue } from "./strict-json.js";
import type { RenderNode } from "./template-class.js";

/** An inspectable in-memory node produced by the fake renderer. */
export interface FakeRenderedNode {
  readonly kind: string;
  readonly attributes: Record<string, JsonValue>;
  readonly children: readonly FakeRenderedNode[];
}

/** An in-memory root the fake renderer projects and can repair. */
export interface FakeRoot {
  node: FakeRenderedNode;
  removed: boolean;
}

type Delivery = (snapshot: JsonObject) => void;

/** A framework-owned in-memory RendererPort for tests and inspection. */
export interface FakeRenderer extends RendererPort {
  roots(): readonly FakeRoot[];
  identityOf(root: FakeRoot): string | undefined;
  /**
   * Test-only: invoke every delivery callback registered for `type` on `root`
   * with `snapshot`, mimicking an adapter reporting a captured interaction. A
   * removed root or an unregistered type delivers nothing. A throw from a
   * delivery callback does NOT propagate out, mirroring a real event system so
   * the failure contract is observed only through the binding's failure channel.
   */
  simulateInteraction(root: FakeRoot, type: string, snapshot: JsonObject): void;
}

/** Create an in-memory fake renderer that requires no browser globals. */
export function createFakeRenderer(): FakeRenderer {
  const tracked: FakeRoot[] = [];
  const registrations = new WeakMap<FakeRoot, Map<string, Set<Delivery>>>();

  const build = (node: RenderNode, identity?: string): FakeRenderedNode => {
    const attributes: Record<string, JsonValue> = { ...node.attributes };
    if (identity !== undefined) {
      attributes[PROJECTION_IDENTITY_ATTRIBUTE] = identity;
    }
    return {
      kind: node.kind,
      attributes,
      children: node.children.map((child) => build(child)),
    };
  };

  const asRoot = (root: AdapterRoot): FakeRoot => root as FakeRoot;

  return {
    createRoot(identity: string, node: RenderNode): AdapterRoot {
      const root: FakeRoot = { node: build(node, identity), removed: false };
      tracked.push(root);
      return root;
    },
    commit(root: AdapterRoot, identity: string, node: RenderNode): void {
      asRoot(root).node = build(node, identity);
    },
    readIdentity(root: AdapterRoot): string | undefined {
      const value = asRoot(root).node.attributes[PROJECTION_IDENTITY_ATTRIBUTE];
      return typeof value === "string" ? value : undefined;
    },
    removeRoot(root: AdapterRoot): void {
      const fakeRoot = asRoot(root);
      fakeRoot.removed = true;
      registrations.delete(fakeRoot);
    },
    registerInteraction(
      root: AdapterRoot,
      type: string,
      deliver: Delivery,
    ): InteractionRegistration {
      const fakeRoot = asRoot(root);
      let byType = registrations.get(fakeRoot);
      if (byType === undefined) {
        byType = new Map();
        registrations.set(fakeRoot, byType);
      }
      let delivers = byType.get(type);
      if (delivers === undefined) {
        delivers = new Set();
        byType.set(type, delivers);
      }
      delivers.add(deliver);
      return {
        remove(): void {
          registrations.get(fakeRoot)?.get(type)?.delete(deliver);
        },
      };
    },
    roots(): readonly FakeRoot[] {
      return tracked;
    },
    identityOf(root: FakeRoot): string | undefined {
      return this.readIdentity(root);
    },
    simulateInteraction(
      root: FakeRoot,
      type: string,
      snapshot: JsonObject,
    ): void {
      const delivers = registrations.get(root)?.get(type);
      if (delivers === undefined) return;
      for (const deliver of [...delivers]) {
        try {
          deliver(snapshot);
        } catch {
          // Mirror real event dispatch: a delivery-callback throw is swallowed,
          // not propagated out of the simulation. Delivery-time failures are
          // observed through the binding's owned failure channel instead.
        }
      }
    },
  };
}
