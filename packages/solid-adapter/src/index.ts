import { createRenderEffect, createRoot, createSignal } from "solid-js";
import {
  PROJECTION_IDENTITY_ATTRIBUTE,
  type AdapterRoot,
  type InteractionRegistration,
  type JsonObject,
  type JsonValue,
  type RenderNode,
  type RendererPort,
} from "@velkren/core";

/**
 * The SolidJS renderer: a real-DOM `RendererPort` implementation. SolidJS and
 * DOM types live only in this package; `@velkren/core` never imports them.
 */
export interface SolidRenderer extends RendererPort {
  /** The shared host under which each root's per-root container is mounted. */
  readonly container: HTMLElement;
  /** The per-root container carrying `identity`, or undefined if removed. */
  elementForIdentity(identity: string): HTMLElement | undefined;
  /**
   * Drive a native interaction on the root carrying `identity` so a DOM event
   * bubbles to the adapter's container listener, exercising every registered
   * capture. A no-op if the root was removed. This is a validation/dev
   * affordance, not a port op.
   */
  simulateInteraction(identity: string, type: string): void;
}

/**
 * A registered Solid view: a function that receives a node's neutral
 * `attributes` (a `JsonObject`) as its props and returns a DOM element. Called
 * within the root's reactive owner so its effects dispose on unmount. SolidJS
 * and this view type live only in this package; `@velkren/core` never sees them.
 */
export type SolidView = (props: JsonObject) => HTMLElement;

/** An adapter-local registry resolving a node `kind` to a native Solid view. */
export type SolidViewRegistry = Record<string, SolidView>;

/** Optional configuration for the SolidJS renderer. */
export interface SolidRendererOptions {
  /** The shared host under which each root's per-root container is mounted. */
  readonly container?: HTMLElement;
  /** A registry resolving a node `kind` to a native Solid view. */
  readonly views?: SolidViewRegistry;
}

interface SolidAdapterRoot {
  /** The adapter-owned per-root container: identity + interaction anchor. */
  readonly rootContainer: HTMLElement;
  readonly identity: string;
  setNode(node: RenderNode): void;
  dispose(): void;
  disposed: boolean;
  readonly listeners: { type: string; listener: EventListener }[];
}

/**
 * Create an in-DOM SolidJS renderer implementing the core RendererPort. Accepts
 * an options bag `{ container?, views? }`, or a bare `HTMLElement` shorthand for
 * `{ container }` (backward-compatible with the no-arg and container call sites).
 */
export function createSolidRenderer(
  options?: HTMLElement | SolidRendererOptions,
): SolidRenderer {
  const { container, views } = normalizeOptions(options);
  const host = container ?? document.createElement("div");
  const rootsByIdentity = new Map<string, SolidAdapterRoot>();

  const asRoot = (root: AdapterRoot): SolidAdapterRoot =>
    root as SolidAdapterRoot;

  const renderer: SolidRenderer = {
    container: host,

    createRoot(identity: string, node: RenderNode): AdapterRoot {
      let root!: SolidAdapterRoot;
      createRoot((dispose) => {
        // The per-root container is the anchor; the rendered content lives
        // inside it. Identity and the interaction listener sit on the container.
        const rootContainer = document.createElement("div");
        const [current, setNode] = createSignal<RenderNode>(node);
        createRenderEffect(() => {
          // Re-stamp identity on the container each render so a commit repairs
          // an out-of-band-removed attribute (commit-repair contract).
          rootContainer.setAttribute(PROJECTION_IDENTITY_ATTRIBUTE, identity);
          // Rebuild the content from the current node each commit (registered
          // view or primitive) and swap it into the container. The anchor stays
          // on the container, so replacing content is safe, and a registered
          // root view both renders and updates on commit. This render effect
          // owns the rebuilt subtree, so a registered view's effects dispose
          // when it re-runs or the root unmounts.
          rootContainer.replaceChildren(renderNodeElement(current(), views));
        });
        const listeners: { type: string; listener: EventListener }[] = [];
        root = {
          rootContainer,
          identity,
          disposed: false,
          listeners,
          setNode(next: RenderNode) {
            setNode(() => next);
          },
          dispose() {
            for (const { type, listener } of listeners) {
              rootContainer.removeEventListener(type, listener);
            }
            listeners.length = 0;
            dispose();
          },
        };
      });
      host.appendChild(root.rootContainer);
      rootsByIdentity.set(identity, root);
      return root;
    },

    commit(root: AdapterRoot, _identity: string, node: RenderNode): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      adapterRoot.setNode(node);
    },

    readIdentity(root: AdapterRoot): string | undefined {
      return (
        asRoot(root).rootContainer.getAttribute(
          PROJECTION_IDENTITY_ATTRIBUTE,
        ) ?? undefined
      );
    },

    removeRoot(root: AdapterRoot): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      adapterRoot.disposed = true;
      rootsByIdentity.delete(adapterRoot.identity);
      adapterRoot.dispose();
      adapterRoot.rootContainer.remove();
    },

    registerInteraction(
      root: AdapterRoot,
      type: string,
      deliver: (snapshot: JsonObject) => void,
    ): InteractionRegistration {
      const adapterRoot = asRoot(root);
      const listener: EventListener = (event) => {
        // Snapshot at the adapter boundary; the live node and native event stay
        // in this package.
        deliver(snapshotNativeEvent(event));
      };
      const record = { type, listener };
      adapterRoot.rootContainer.addEventListener(type, listener);
      adapterRoot.listeners.push(record);
      return {
        remove(): void {
          const index = adapterRoot.listeners.indexOf(record);
          if (index === -1) return;
          adapterRoot.listeners.splice(index, 1);
          adapterRoot.rootContainer.removeEventListener(type, listener);
        },
      };
    },

    elementForIdentity(identity: string): HTMLElement | undefined {
      return rootsByIdentity.get(identity)?.rootContainer;
    },

    simulateInteraction(identity: string, type: string): void {
      const adapterRoot = rootsByIdentity.get(identity);
      if (adapterRoot === undefined || adapterRoot.disposed) return;
      // Dispatch from the current content element (rebuilt each commit) so it
      // bubbles to the container's native listener, exactly as a real
      // interaction would.
      const content = adapterRoot.rootContainer.firstElementChild;
      if (content === null) return;
      content.dispatchEvent(new Event(type, { bubbles: true }));
    },
  };

  return renderer;
}

/**
 * Capture selected native-event fields as an immutable snapshot. The live DOM
 * node and native event object are never returned or forwarded.
 */
export function snapshotNativeEvent(event: Event): JsonObject {
  const target = event.target;
  const value =
    target !== null &&
    typeof target === "object" &&
    "value" in target &&
    typeof (target as { value: unknown }).value === "string"
      ? (target as { value: string }).value
      : null;
  return Object.freeze({ type: event.type, value });
}

/**
 * Produce a node's content element. The shared, registry-aware helper used by
 * both the root render effect and child building: on a `views[kind]` hit it
 * renders the registered Solid view as a self-contained leaf (raw
 * `node.attributes` as props; the node's Velkren-managed children are NOT
 * projected into it); on a miss it builds the primitive element with its
 * attributes and children recursively, exactly as before.
 */
function renderNodeElement(
  node: RenderNode,
  views: SolidViewRegistry,
): HTMLElement {
  const view = views[node.kind];
  if (view !== undefined) return view(node.attributes);
  const element = document.createElement(node.kind);
  applyAttributes(element, node.attributes);
  element.replaceChildren(
    ...node.children.map((child) => renderNodeElement(child, views)),
  );
  return element;
}

/**
 * Normalize the factory argument into an options bag. A bare `HTMLElement`
 * shorthand for `{ container }` is detected by its `nodeType` (rather than
 * `instanceof HTMLElement`, which would throw in the core's Node-only
 * environment where the DOM global is absent).
 */
function normalizeOptions(options?: HTMLElement | SolidRendererOptions): {
  container: HTMLElement | undefined;
  views: SolidViewRegistry;
} {
  if (options == null) return { container: undefined, views: {} };
  if ("nodeType" in options) return { container: options, views: {} };
  return { container: options.container, views: options.views ?? {} };
}

function applyAttributes(element: HTMLElement, attributes: JsonObject): void {
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, stringifyAttribute(value));
  }
}

function stringifyAttribute(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
