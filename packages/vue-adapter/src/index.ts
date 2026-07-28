import {
  defineComponent,
  h,
  provide,
  render,
  type FunctionalComponent,
  type InjectionKey,
  type PropType,
  type VNode,
} from "vue";
import {
  isViewNode,
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
 * Registers an element inside a view's own output as a named anchor a child
 * projection can later be mounted into via `mountChild`. Calling it is
 * optional; a view that never calls it is an unaffected, strict leaf. A real
 * DOM node only exists at commit, so a view typically calls this from a
 * `ref` on the element it wants to expose, not from its render body.
 */
export type RegisterAnchor = (name: string, element: HTMLElement) => void;

/**
 * Supplies `registerAnchor` to a view via Vue's `provide`/`inject` rather
 * than an extra prop, so `VueView`'s prop type stays exactly
 * `FunctionalComponent<JsonObject>` — unchanged, and an existing view keeps
 * compiling against the same type as before this feature (mixing a function
 * into a `JsonObject`-typed props object would conflict with its strict
 * `JsonValue`-only index signature, the same issue the React adapter hit and
 * fixed with context instead of a prop). A view calls
 * `inject(REGISTER_ANCHOR_KEY)` to opt in.
 */
export const REGISTER_ANCHOR_KEY: InjectionKey<RegisterAnchor> = Symbol(
  "velkren:registerAnchor",
);

/**
 * A registered Vue view: a functional component receiving a view node's
 * neutral `props` (a `JsonObject`) as its props. Vue and this view type live
 * only in this package; `@velkren/core` never references them.
 */
export type VueView = FunctionalComponent<JsonObject>;

/** An adapter-local registry resolving a view node's `viewId` to a native Vue view. */
export type VueViewRegistry = Record<string, VueView>;

/** Optional configuration for the Vue renderer. */
export interface VueRendererOptions {
  /** The shared host under which each root's per-root container is mounted. */
  readonly container?: HTMLElement;
  /** A registry resolving a view node's `viewId` to a native Vue view. */
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
  /** Elements a view rendered on this root registered as named anchors, for
   * a later `mountChild` call to mount into. */
  readonly anchors: Map<string, HTMLElement>;
}

/**
 * A small internal wrapper component whose only job is to `provide` the
 * root's `registerAnchor` function once for the whole tree via Vue's own
 * `provide`/`inject`, so a nested view can opt in without threading an extra
 * prop through every primitive element in between.
 */
const VelkrenTree = defineComponent({
  name: "VelkrenTree",
  props: {
    node: { type: Object as PropType<RenderNode>, required: true },
    views: { type: Object as PropType<VueViewRegistry>, required: true },
    anchors: {
      type: Object as PropType<Map<string, HTMLElement>>,
      required: true,
    },
  },
  setup(props) {
    provide(REGISTER_ANCHOR_KEY, (name: string, element: HTMLElement) => {
      props.anchors.set(name, element);
    });
    return () => buildVNode(props.node, props.views);
  },
});

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

  /** Build a per-root container mounted under `parentContainer`, shared by
   * both a top-level `createRoot` (parent = the configured host) and a
   * nested `mountChild` (parent = a registered anchor element). */
  function mountRootInto(
    parentContainer: HTMLElement,
    identity: string,
    node: RenderNode,
  ): VueAdapterRoot {
    const rootContainer = document.createElement("div");
    parentContainer.appendChild(rootContainer);
    const anchors = new Map<string, HTMLElement>();
    // Vue's `render` mounts synchronously, so the port's read-after-return
    // contract holds without an explicit flush.
    render(h(VelkrenTree, { node, views, anchors }), rootContainer);
    // Identity is stamped imperatively on the container (never a vnode prop):
    // a re-render alone would not restore an out-of-band-removed attribute.
    stampIdentity(rootContainer, identity);
    return {
      container: rootContainer,
      identity,
      registrations: new Map(),
      listeners: new Map(),
      disposed: false,
      anchors,
    };
  }

  const renderer: VueRenderer = {
    createRoot(identity: string, node: RenderNode): AdapterRoot {
      // Each root owns a container attached under the host; it is the anchor for
      // identity and for the native interaction listener, and it gives Vue's
      // imperative renderer a live DOM host to patch.
      const root = mountRootInto(container ?? document.body, identity, node);
      rootsByIdentity.set(identity, root);
      return root;
    },

    mountChild(
      parent: AdapterRoot,
      anchor: string,
      identity: string,
      node: RenderNode,
    ): AdapterRoot {
      const parentRoot = asRoot(parent);
      const anchorElement = parentRoot.anchors.get(anchor);
      // A stale entry (the view that registered it stopped rendering on a
      // later commit, detaching the element from the root's own container)
      // is treated the same as never registered, rather than silently
      // mounting into an invisible node. Checked against the root's own
      // container -- not global document connectivity, since the whole
      // render tree may legitimately be off-document (e.g. in tests).
      if (
        anchorElement === undefined ||
        !parentRoot.container.contains(anchorElement)
      ) {
        throw new Error(
          `Velkren: no anchor named ${JSON.stringify(anchor)} was registered on the parent root`,
        );
      }
      // An independent Vue render root, not a Teleport: Velkren's own
      // interaction capture is per-root-container native listeners entirely
      // outside Vue's own renderer, so no framework-level coordination is
      // needed.
      const root = mountRootInto(anchorElement, identity, node);
      rootsByIdentity.set(identity, root);
      return root;
    },

    commit(root: AdapterRoot, _identity: string, node: RenderNode): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      render(
        h(VelkrenTree, {
          node,
          views,
          anchors: adapterRoot.anchors,
        }),
        adapterRoot.container,
      );
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
          // A child root's container can be nested inside this one (mounted
          // via mountChild); an interaction inside it still bubbles here
          // natively. Ignore it if the nearest identity-bearing ancestor is
          // not this container -- it belongs to that more deeply nested
          // root instead.
          if (!belongsToContainer(event.target, adapterRoot.container)) {
            return;
          }
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
 * `true` when `container` is the nearest ancestor of `target` (inclusive)
 * carrying the projection identity attribute. A nested child root's
 * container -- mounted via `mountChild` inside this one -- would be a
 * closer match than the parent, so this is `false` for an interaction that
 * structurally belongs to that nested root instead.
 */
function belongsToContainer(
  target: EventTarget | null,
  container: HTMLElement,
): boolean {
  if (!(target instanceof Element)) return true;
  return target.closest(`[${PROJECTION_IDENTITY_ATTRIBUTE}]`) === container;
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
 * Build a Vue vnode from a render node. A view node is resolved by `viewId`,
 * for every node incl. the root, and rendered as a self-contained leaf with
 * its RAW `props` (no translation, no children projected into it, since a
 * view node has none of its own). A primitive node never consults the
 * registry; it is built with its attributes and children.
 */
function buildVNode(
  node: RenderNode,
  views: VueViewRegistry,
  key?: string,
): VNode {
  if (isViewNode(node)) {
    const view = views[node.viewId];
    if (view === undefined) {
      throw new Error(
        `Velkren: no view registered for viewId ${JSON.stringify(node.viewId)}`,
      );
    }
    return h(view, key === undefined ? node.props : { key, ...node.props });
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
