import {
  createContext,
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
 * Registers an element inside a view's own output as a named anchor a child
 * projection can later be mounted into via `mountChild`. Calling it is
 * optional; a view that never calls it is an unaffected, strict leaf. A real
 * DOM node only exists at commit, so a view typically calls this from a
 * `ref` callback on the element it wants to expose, not from its render body.
 */
export type RegisterAnchor = (name: string, element: HTMLElement) => void;

/**
 * Supplies `registerAnchor` to a view via React context rather than an extra
 * prop, so `ReactView`'s prop type stays exactly `FunctionComponent<JsonObject>`
 * — unchanged, and an existing view keeps compiling against the same type as
 * before this feature. A view calls `useContext(RegisterAnchorContext)` to
 * opt in; the value is `undefined` only outside a Velkren-rendered tree,
 * which never happens for a view the adapter itself renders.
 */
export const RegisterAnchorContext = createContext<RegisterAnchor | undefined>(
  undefined,
);

/**
 * A registered React view: a component that receives a node's neutral
 * `attributes` (a `JsonObject`) as its props. React and this view type live
 * only in this package; `@velkren/core` never references them.
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
  /** Elements a view rendered on this root registered as named anchors, for
   * a later `mountChild` call to mount into. */
  readonly anchors: Map<string, HTMLElement>;
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

  /** Build a per-root container mounted under `parentContainer`, shared by
   * both a top-level `createRoot` (parent = the configured host) and a
   * nested `mountChild` (parent = a registered anchor element). */
  function mountRootInto(
    parentContainer: HTMLElement,
    identity: string,
    node: RenderNode,
  ): ReactAdapterRoot {
    const rootContainer = document.createElement("div");
    parentContainer.appendChild(rootContainer);
    const reactRoot = createReactRoot(rootContainer);
    const anchors = new Map<string, HTMLElement>();
    // Flush synchronously: the port contract reads the mounted DOM the instant
    // this returns, but `react-dom` otherwise only schedules the render.
    flushSync(() => {
      reactRoot.render(createElement(VelkrenTree, { node, views, anchors }));
    });
    // Identity is stamped imperatively on the container (never a React prop):
    // a re-render alone would not restore an out-of-band-removed attribute.
    stampIdentity(rootContainer, identity);
    return {
      container: rootContainer,
      reactRoot,
      identity,
      registrations: new Map(),
      listeners: new Map(),
      disposed: false,
      anchors,
    };
  }

  const renderer: ReactRenderer = {
    createRoot(identity: string, node: RenderNode): AdapterRoot {
      // Each root owns a container attached under `document`; it is the anchor
      // for identity and for the native interaction listener, and it gives the
      // reconciler a live DOM host to mount the rendered content into.
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
      // An independent React root, not a portal: Velkren's own interaction
      // capture is per-root-container native listeners entirely outside
      // React's reconciler, so no framework-level coordination is needed.
      const root = mountRootInto(anchorElement, identity, node);
      rootsByIdentity.set(identity, root);
      return root;
    },

    commit(root: AdapterRoot, _identity: string, node: RenderNode): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      flushSync(() => {
        adapterRoot.reactRoot.render(
          createElement(VelkrenTree, {
            node,
            views,
            anchors: adapterRoot.anchors,
          }),
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
  readonly anchors: Map<string, HTMLElement>;
}

/** Render a RenderNode tree with `React.createElement` (no JSX), providing
 * `RegisterAnchorContext` once for the whole tree so any nested view can opt
 * into exposing an anchor without threading an extra prop through every
 * primitive element in between. */
function VelkrenTree({ node, views, anchors }: VelkrenTreeProps): ReactElement {
  const registerAnchor: RegisterAnchor = (name, element) => {
    anchors.set(name, element);
  };
  return createElement(
    RegisterAnchorContext.Provider,
    { value: registerAnchor },
    renderNode(node, views),
  );
}

/** Tags React treats as controlled form elements: a `value` prop installs
 * React's own value-tracking, which resyncs the DOM on every render and
 * leaves the field read-only without a matching `onChange`. `value` is kept
 * out of these tags' props entirely and applied through a ref instead (see
 * `renderNode`), so React never installs that tracking in the first place. */
const CONTROLLED_VALUE_TAGS = new Set(["input", "textarea", "select"]);

function renderNode(
  node: RenderNode,
  views: ReactViewRegistry,
  key?: string,
): ReactElement {
  // Registry check first, for every node incl. the root: on a hit render the
  // registered view as a self-contained leaf with the node's RAW attributes as
  // props — no `translateAttribute`/`stringifyAttribute` translation and no
  // children auto-projected into it. `registerAnchor` reaches the view via
  // `RegisterAnchorContext`, not a prop, so this call site and `ReactView`'s
  // prop type are both unchanged by that feature.
  const view = views[node.kind];
  if (view !== undefined) {
    return key === undefined
      ? createElement(view, node.attributes)
      : createElement(view, { key, ...node.attributes });
  }
  const props: Record<string, unknown> = {};
  if (key !== undefined) props.key = key;
  const controlledValue = CONTROLLED_VALUE_TAGS.has(node.kind)
    ? node.attributes.value
    : undefined;
  for (const [name, value] of Object.entries(node.attributes)) {
    if (name === "value" && controlledValue !== undefined) continue;
    props[translateAttribute(name)] = stringifyAttribute(value);
  }
  if (controlledValue !== undefined) {
    // A fresh closure every render means React invokes this ref on every
    // commit (old ref with null, new ref with the node, for an unchanged
    // underlying DOM element) — synchronously, inside the same flushSync
    // this file already wraps every render in. React never sees `value` as
    // a prop on this node, so there is nothing for its controlled-input
    // machinery to install or fight back with.
    props.ref = (element: HTMLInputElement | null): void => {
      if (element === null) return;
      applyValueProperty(element, stringifyAttribute(controlledValue));
    };
  }
  const children = node.children.map((child, index) =>
    renderNode(child, views, String(index)),
  );
  return createElement(node.kind, props, ...children);
}

/**
 * Apply `next` to `element.value` as a live DOM property: skip the assignment
 * when it already holds `next` (avoids disturbing the caret on a redundant
 * re-commit), and otherwise preserve the current text selection across the
 * assignment, clamped to the new length. Selection access is guarded because
 * some `<input>` types (number, email, date, ...) throw on
 * `selectionStart`/`selectionEnd`/`setSelectionRange` per the HTML Standard.
 * Mirrors the SolidJS adapter's helper of the same shape.
 */
function applyValueProperty(element: HTMLInputElement, next: string): void {
  if (element.value === next) return;
  let selection:
    | {
        start: number | null;
        end: number | null;
        direction: "forward" | "backward" | "none" | null;
      }
    | undefined;
  try {
    selection = {
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection,
    };
  } catch {
    selection = undefined;
  }
  element.value = next;
  if (selection?.start != null && selection.end != null) {
    try {
      const max = next.length;
      element.setSelectionRange(
        Math.min(selection.start, max),
        Math.min(selection.end, max),
        selection.direction ?? undefined,
      );
    } catch {
      // Selection is not supported on this element/type; nothing to restore.
    }
  }
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
