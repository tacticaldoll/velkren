import {
  PROJECTION_IDENTITY_ATTRIBUTE,
  type AdapterRoot,
  type RendererPort,
} from "./renderer-port.js";
import type { JsonValue } from "./strict-json.js";
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

/** A framework-owned in-memory RendererPort for tests and inspection. */
export interface FakeRenderer extends RendererPort {
  roots(): readonly FakeRoot[];
  identityOf(root: FakeRoot): string | undefined;
}

/** Create an in-memory fake renderer that requires no browser globals. */
export function createFakeRenderer(): FakeRenderer {
  const tracked: FakeRoot[] = [];

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
      asRoot(root).removed = true;
    },
    roots(): readonly FakeRoot[] {
      return tracked;
    },
    identityOf(root: FakeRoot): string | undefined {
      return this.readIdentity(root);
    },
  };
}
