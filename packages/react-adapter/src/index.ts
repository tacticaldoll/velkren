import {
  createElement,
  type FunctionComponent,
  type ReactElement,
} from "react";
import { flushSync } from "react-dom";
import { createRoot as createReactRoot, type Root } from "react-dom/client";
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
 * The React renderer: a real-DOM `RendererPort` implementation driven by React's
 * reconciler through `react-dom/client`. React and DOM types live only in this
 * package; `@velkren/core` never imports them.
 */
export interface ReactRenderer extends RendererPort {
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
 * A registered React view: a component that receives a node's neutral
 * `attributes` (a `JsonObject`) as its props. React and this view type live only
 * in this package; `@velkren/core` never references them.
 */
export type ReactView = FunctionComponent<JsonObject>;

/** An adapter-local registry resolving a node `kind` to a native React view. */
export type ReactViewRegistry = Record<string, ReactView>;

/** Optional configuration for the React renderer. */
export interface ReactRendererOptions {
  /** The shared host under which each root's per-root container is mounted. */
  readonly container?: HTMLElement;
  /** A registry resolving a node `kind` to a native React view. */
  readonly views?: ReactViewRegistry;
}

/** Deliver an immutable interaction snapshot inward through the port. */
type Deliver = (snapshot: JsonObject) => void;

/**
 * The adapter-owned, per-root registration store. A mutable Map the container's
 * native listener reads at event time so registration needs no re-render (the
 * container, not the rendered content, is the interaction anchor).
 */
type RegistrationMap = Map<string, Deliver>;

interface ReactAdapterRoot {
  readonly container: HTMLElement;
  readonly reactRoot: Root;
  readonly identity: string;
  readonly registrations: RegistrationMap;
  /** One native listener per registered interaction type on the container. */
  readonly listeners: Map<string, EventListener>;
  disposed: boolean;
}

/**
 * Create an in-DOM React renderer implementing the core RendererPort. Accepts an
 * options bag `{ container?, views? }`, or a bare `HTMLElement` shorthand for
 * `{ container }` (backward-compatible with the no-arg and container call sites).
 */
export function createReactRenderer(
  options?: HTMLElement | ReactRendererOptions,
): ReactRenderer {
  const { container, views } = normalizeOptions(options);
  const rootsByIdentity = new Map<string, ReactAdapterRoot>();

  const asRoot = (root: AdapterRoot): ReactAdapterRoot =>
    root as ReactAdapterRoot;

  const renderer: ReactRenderer = {
    createRoot(identity: string, node: RenderNode): AdapterRoot {
      // Each root owns a container attached under `document`; it is the anchor
      // for identity and for the native interaction listener, and it gives the
      // reconciler a live DOM host to mount the rendered content into.
      const host = container ?? document.body;
      const rootContainer = document.createElement("div");
      host.appendChild(rootContainer);
      const reactRoot = createReactRoot(rootContainer);
      // Flush synchronously: the port contract reads the mounted DOM the instant
      // this returns, but `react-dom` otherwise only schedules the render.
      flushSync(() => {
        reactRoot.render(createElement(VelkrenTree, { node, views }));
      });
      // Identity is stamped imperatively on the container (never a React prop):
      // a re-render alone would not restore an out-of-band-removed attribute.
      stampIdentity(rootContainer, identity);
      const root: ReactAdapterRoot = {
        container: rootContainer,
        reactRoot,
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
      flushSync(() => {
        adapterRoot.reactRoot.render(
          createElement(VelkrenTree, { node, views }),
        );
      });
      // Re-stamp: reconciliation updates content but does not touch the
      // container's identity attribute, so repair it here (commit-repair).
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
      adapterRoot.reactRoot.unmount();
      adapterRoot.container.remove();
    },

    registerInteraction(
      root: AdapterRoot,
      type: string,
      deliver: Deliver,
    ): InteractionRegistration {
      const adapterRoot = asRoot(root);
      // Record interest per type and ensure one native listener on the container
      // for it. No re-render: the listener reads the Map at event time, so this
      // takes effect whether it happens before or after mount.
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
 * SolidJS `snapshotNativeEvent` boundary).
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

interface VelkrenTreeProps {
  readonly node: RenderNode;
  readonly views: ReactViewRegistry;
}

/** Render a RenderNode tree with `React.createElement` (no JSX). */
function VelkrenTree({ node, views }: VelkrenTreeProps): ReactElement {
  return renderNode(node, views);
}

function renderNode(
  node: RenderNode,
  views: ReactViewRegistry,
  key?: string,
): ReactElement {
  // Registry check first, for every node incl. the root: on a hit render the
  // registered view as a self-contained leaf with the node's RAW attributes as
  // props — no `translateAttribute`/`stringifyAttribute` translation and no
  // children projected into it. On a miss, fall through to the primitive path.
  const view = views[node.kind];
  if (view !== undefined) {
    return key === undefined
      ? createElement(view, node.attributes)
      : createElement(view, { key, ...node.attributes });
  }
  const props: Record<string, unknown> = {};
  if (key !== undefined) props.key = key;
  for (const [name, value] of Object.entries(node.attributes)) {
    props[translateAttribute(name)] = stringifyAttribute(value);
  }
  const children = node.children.map((child, index) =>
    renderNode(child, views, String(index)),
  );
  return createElement(node.kind, props, ...children);
}

/**
 * Normalize the factory argument into an options bag. A bare `HTMLElement`
 * shorthand for `{ container }` is detected by its `nodeType` (rather than
 * `instanceof HTMLElement`, which would throw in the core's Node-only
 * environment where the DOM global is absent).
 */
function normalizeOptions(options?: HTMLElement | ReactRendererOptions): {
  container: HTMLElement | undefined;
  views: ReactViewRegistry;
} {
  if (options == null) return { container: undefined, views: {} };
  if ("nodeType" in options) return { container: options, views: {} };
  return { container: options.container, views: options.views ?? {} };
}

/** Translate renderer-neutral attribute names to React's DOM prop names. */
function translateAttribute(name: string): string {
  if (name === "class") return "className";
  if (name === "for") return "htmlFor";
  return name;
}

function stringifyAttribute(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function stampIdentity(container: HTMLElement, identity: string): void {
  container.setAttribute(PROJECTION_IDENTITY_ATTRIBUTE, identity);
}

/** A membrane configuration bound to the React renderer. */
export type MembraneConfig = MembraneConfigCore<ReactRenderer>;
/** What a React membrane hands its factory. */
export type MembraneMountContext = MembraneMountContextCore<ReactRenderer>;

/**
 * Register a custom element that projects a Velkren composition on the React
 * renderer. A thin wrapper over the shared, renderer-agnostic membrane core in
 * `@velkren/element`, binding it to `createReactRenderer`.
 */
export function defineVelkrenElement(
  tag: string,
  config: MembraneConfig,
): void {
  defineMembraneElement(tag, config, createReactRenderer);
}
