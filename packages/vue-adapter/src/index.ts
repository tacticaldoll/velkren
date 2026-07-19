import { h, render, type FunctionalComponent, type VNode } from "vue";
import {
  PROJECTION_IDENTITY_ATTRIBUTE,
  type AdapterRoot,
  type InteractionRegistration,
  type JsonObject,
  type JsonValue,
  type RenderNode,
  type RendererPort,
} from "@velkren/core";
import {
  defineMembraneElement,
  type MembraneConfig as MembraneConfigCore,
  type MembraneMountContext as MembraneMountContextCore,
} from "@velkren/element";

export type { MembraneMount } from "@velkren/element";

/**
 * The Vue renderer: a real-DOM `RendererPort` implementation driven by Vue's
 * imperative renderer (`render` / `h`). Vue and DOM types live only in this
 * package; `@velkren/core` never imports them.
 */
export interface VueRenderer extends RendererPort {
  /** The per-root container carrying `identity`, or undefined if removed. */
  elementForIdentity(identity: string): HTMLElement | undefined;
  /**
   * Drive a native interaction on the root carrying `identity` so a DOM event
   * bubbles to the adapter's container listener, exercising every registered
   * capture. A no-op if the root was removed. A validation/dev affordance, not a
   * port op.
   */
  simulateInteraction(identity: string, type: string): void;
}

/**
 * A registered Vue view: a functional component receiving a node's neutral
 * `attributes` (a `JsonObject`) as its props. Vue and this view type live only in
 * this package; `@velkren/core` never references them.
 */
export type VueView = FunctionalComponent<JsonObject>;

/** An adapter-local registry resolving a node `kind` to a native Vue view. */
export type VueViewRegistry = Record<string, VueView>;

/** Optional configuration for the Vue renderer. */
export interface VueRendererOptions {
  /** The shared host under which each root's per-root container is mounted. */
  readonly container?: HTMLElement;
  /** A registry resolving a node `kind` to a native Vue view. */
  readonly views?: VueViewRegistry;
}

/** Deliver an immutable interaction snapshot inward through the port. */
type Deliver = (snapshot: JsonObject) => void;

/** The adapter-owned, per-root registration store read at event time. */
type RegistrationMap = Map<string, Deliver>;

interface VueAdapterRoot {
  readonly container: HTMLElement;
  readonly identity: string;
  readonly registrations: RegistrationMap;
  readonly listeners: Map<string, EventListener>;
  disposed: boolean;
}

/**
 * Create an in-DOM Vue renderer implementing the core `RendererPort`. Accepts an
 * options bag `{ container?, views? }`, or a bare `HTMLElement` shorthand for
 * `{ container }`.
 */
export function createVueRenderer(
  options?: HTMLElement | VueRendererOptions,
): VueRenderer {
  const { container, views } = normalizeOptions(options);
  const rootsByIdentity = new Map<string, VueAdapterRoot>();

  const asRoot = (root: AdapterRoot): VueAdapterRoot => root as VueAdapterRoot;

  const renderer: VueRenderer = {
    createRoot(identity: string, node: RenderNode): AdapterRoot {
      // Each root owns a container attached under the host; it is the anchor for
      // identity and for the native interaction listener, and it gives Vue's
      // imperative renderer a live DOM host to patch.
      const host = container ?? document.body;
      const rootContainer = document.createElement("div");
      host.appendChild(rootContainer);
      // Vue's `render` mounts synchronously, so the port's read-after-return
      // contract holds without an explicit flush.
      render(buildVNode(node, views), rootContainer);
      // Identity is stamped imperatively on the container (never a vnode prop):
      // a re-render alone would not restore an out-of-band-removed attribute.
      stampIdentity(rootContainer, identity);
      const root: VueAdapterRoot = {
        container: rootContainer,
        identity,
        registrations: new Map(),
        listeners: new Map(),
        disposed: false,
      };
      rootsByIdentity.set(identity, root);
      return root;
    },

    commit(root: AdapterRoot, _identity: string, node: RenderNode): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      render(buildVNode(node, views), adapterRoot.container);
      // Re-stamp: patching updates content but does not touch the container's
      // identity attribute, so repair it here (commit-repair).
      stampIdentity(adapterRoot.container, adapterRoot.identity);
    },

    readIdentity(root: AdapterRoot): string | undefined {
      return (
        asRoot(root).container.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE) ??
        undefined
      );
    },

    removeRoot(root: AdapterRoot): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      adapterRoot.disposed = true;
      rootsByIdentity.delete(adapterRoot.identity);
      for (const [type, listener] of adapterRoot.listeners) {
        adapterRoot.container.removeEventListener(type, listener);
      }
      adapterRoot.listeners.clear();
      adapterRoot.registrations.clear();
      // Unmount the Vue tree, then detach the container.
      render(null, adapterRoot.container);
      adapterRoot.container.remove();
    },

    registerInteraction(
      root: AdapterRoot,
      type: string,
      deliver: Deliver,
    ): InteractionRegistration {
      const adapterRoot = asRoot(root);
      // Record interest per type and ensure one native listener on the container
      // for it. No re-render: the listener reads the Map at event time.
      adapterRoot.registrations.set(type, deliver);
      if (!adapterRoot.listeners.has(type)) {
        const listener: EventListener = (event) => {
          // Snapshot at the adapter boundary; the live node and native event
          // stay in this package.
          adapterRoot.registrations.get(type)?.(snapshotNativeEvent(event));
        };
        adapterRoot.listeners.set(type, listener);
        adapterRoot.container.addEventListener(type, listener);
      }
      return {
        remove(): void {
          if (adapterRoot.registrations.get(type) === deliver) {
            adapterRoot.registrations.delete(type);
          }
        },
      };
    },

    elementForIdentity(identity: string): HTMLElement | undefined {
      const adapterRoot = rootsByIdentity.get(identity);
      if (adapterRoot === undefined || adapterRoot.disposed) return undefined;
      return adapterRoot.container;
    },

    simulateInteraction(identity: string, type: string): void {
      const adapterRoot = rootsByIdentity.get(identity);
      if (adapterRoot === undefined || adapterRoot.disposed) return;
      const host = adapterRoot.container.firstElementChild;
      if (host === null) return;
      // A native bubbling event from the content bubbles to the container's
      // native listener, which snapshots it and invokes the registered deliver.
      host.dispatchEvent(new Event(type, { bubbles: true }));
    },
  };

  return renderer;
}

/**
 * Capture selected native-event fields as an immutable snapshot. The live DOM
 * node and native event object are never returned or forwarded (mirrors the
 * SolidJS and React `snapshotNativeEvent` boundary).
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
 * Build a Vue vnode from a render node. Registry check first, for every node incl.
 * the root: on a hit render the registered view as a self-contained leaf with the
 * node's RAW attributes as props (no translation, no children projected into it).
 * On a miss, build the primitive element with its attributes and children.
 */
function buildVNode(
  node: RenderNode,
  views: VueViewRegistry,
  key?: string,
): VNode {
  const view = views[node.kind];
  if (view !== undefined) {
    return h(
      view,
      key === undefined ? node.attributes : { key, ...node.attributes },
    );
  }
  const props: Record<string, unknown> = {};
  if (key !== undefined) props.key = key;
  for (const [name, value] of Object.entries(node.attributes)) {
    props[name] = stringifyAttribute(value);
  }
  const children = node.children.map((child, index) =>
    buildVNode(child, views, String(index)),
  );
  return h(node.kind, props, children);
}

function stampIdentity(container: HTMLElement, identity: string): void {
  container.setAttribute(PROJECTION_IDENTITY_ATTRIBUTE, identity);
}

function stringifyAttribute(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function normalizeOptions(options?: HTMLElement | VueRendererOptions): {
  container: HTMLElement | undefined;
  views: VueViewRegistry;
} {
  if (options == null) return { container: undefined, views: {} };
  if ("nodeType" in options) return { container: options, views: {} };
  return { container: options.container, views: options.views ?? {} };
}

/** A membrane configuration bound to the Vue renderer. */
export type MembraneConfig = MembraneConfigCore<VueRenderer>;
/** What a Vue membrane hands its factory. */
export type MembraneMountContext = MembraneMountContextCore<VueRenderer>;

/**
 * Register a custom element that projects a Velkren composition on the Vue
 * renderer. A thin wrapper over the shared, renderer-agnostic membrane core in
 * `@velkren/element`, binding it to `createVueRenderer`.
 */
export function defineVelkrenElement(
  tag: string,
  config: MembraneConfig,
): void {
  defineMembraneElement(tag, config, createVueRenderer);
}
