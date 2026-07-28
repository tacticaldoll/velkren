import { createRenderEffect, createRoot, createSignal } from "solid-js";
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
 * What a Solid view's second argument exposes: an opt-in hook to declare that
 * an element inside the view's own output is a named anchor a child
 * projection can later be mounted into via `mountChild`. Calling it is
 * optional; a view that never calls it is an unaffected, strict leaf.
 */
export interface SolidViewContext {
  registerAnchor(name: string, element: HTMLElement): void;
}

/**
 * A registered Solid view: a function that receives a view node's neutral
 * `props` (a `JsonObject`) as its props and a `SolidViewContext`, and
 * returns a DOM element. Called within the root's reactive owner so its
 * effects dispose on unmount. SolidJS and this view type live only in this
 * package; `@velkren/core` never sees them.
 */
export type SolidView = (
  props: JsonObject,
  context: SolidViewContext,
) => HTMLElement;

/** An adapter-local registry resolving a view node's `viewId` to a native Solid view. */
export type SolidViewRegistry = Record<string, SolidView>;

/** Optional configuration for the SolidJS renderer. */
export interface SolidRendererOptions {
  /** The shared host under which each root's per-root container is mounted. */
  readonly container?: HTMLElement;
  /** A registry resolving a view node's `viewId` to a native Solid view. */
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
  /** Elements a view rendered on this root registered as named anchors, for
   * a later `mountChild` call to mount into. */
  readonly anchors: Map<string, HTMLElement>;
  /** Which child root (if any) is currently mounted at each of this root's
   * anchor names, so a later commit that replaces an anchor's element can
   * reconcile a live child instead of silently orphaning it. */
  readonly childrenByAnchor: Map<string, SolidAdapterRoot>;
  /** Set only on a root created via `mountChild`: which parent root and
   * anchor name it was mounted under, so disposal can clear the parent's
   * `childrenByAnchor` entry without a second registry to keep in sync. */
  mountedAt?: { parent: SolidAdapterRoot; anchor: string };
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

  /** Shared disposal, used both by an explicit `removeRoot` call and by
   * `reconcileAnchoredChildren` when an anchor a child was mounted at
   * disappears entirely. Clears the parent's `childrenByAnchor` entry only
   * if it still points at this exact root, so disposing an already-replaced
   * child never clobbers whatever was mounted at that anchor afterward. */
  function disposeRoot(adapterRoot: SolidAdapterRoot): void {
    if (adapterRoot.disposed) return;
    adapterRoot.disposed = true;
    rootsByIdentity.delete(adapterRoot.identity);
    if (adapterRoot.mountedAt !== undefined) {
      const { parent, anchor } = adapterRoot.mountedAt;
      if (parent.childrenByAnchor.get(anchor) === adapterRoot) {
        parent.childrenByAnchor.delete(anchor);
      }
    }
    adapterRoot.dispose();
    adapterRoot.rootContainer.remove();
  }

  /**
   * After a commit may have replaced a root's registered anchors, reconcile
   * any child mounted at one: if the anchor name still exists under a new
   * element, move the child's own container there (a plain `appendChild` --
   * no rebuild, no disposal, nothing about the child's own identity or
   * interaction listeners changes); if the name is gone entirely, the child
   * has nowhere to live and is released through the same path as an
   * explicit `removeRoot`, with the loss reported rather than left silent.
   */
  function reconcileAnchoredChildren(
    root: SolidAdapterRoot,
    oldAnchors: ReadonlyMap<string, HTMLElement>,
  ): void {
    for (const [name, childRoot] of [...root.childrenByAnchor]) {
      const newElement = root.anchors.get(name);
      // A rebuilt PRIMITIVE (not a view) never calls `registerAnchor`, so a
      // stale Map entry can persist unchanged even though its element was
      // just detached by this same commit's rebuild -- containment, not
      // just Map presence, is what actually says "this anchor still lives
      // in the current tree" (mirrors `mountChild`'s own staleness guard).
      const stillLive =
        newElement !== undefined && root.rootContainer.contains(newElement);
      if (!stillLive) {
        root.childrenByAnchor.delete(name);
        reportAnchorLost(name);
        disposeRoot(childRoot);
      } else if (newElement !== oldAnchors.get(name)) {
        newElement.appendChild(childRoot.rootContainer);
      }
    }
  }

  /** Build a per-root container mounted under `parentContainer`, shared by
   * both a top-level `createRoot` (parent = host) and a nested
   * `mountChild` (parent = a registered anchor element). */
  function mountRootInto(
    parentContainer: HTMLElement,
    identity: string,
    node: RenderNode,
  ): SolidAdapterRoot {
    let root!: SolidAdapterRoot;
    createRoot((dispose) => {
      // The per-root container is the anchor; the rendered content lives
      // inside it. Identity and the interaction listener sit on the container.
      const rootContainer = document.createElement("div");
      const anchors = new Map<string, HTMLElement>();
      const [current, setNode] = createSignal<RenderNode>(node);
      // The last node this effect rendered, and the mounted content element,
      // carried across effect runs so a commit can reconcile in place.
      let previous: RenderNode | undefined;
      let content: HTMLElement | undefined;
      createRenderEffect(() => {
        const next = current();
        // Re-stamp identity on the container each run so a commit repairs an
        // out-of-band-removed attribute (commit-repair contract).
        rootContainer.setAttribute(PROJECTION_IDENTITY_ATTRIBUTE, identity);
        if (content === undefined || previous === undefined) {
          // First run: build the content once and mount it.
          content = renderNodeElement(next, views, anchors);
          rootContainer.replaceChildren(content);
        } else {
          // Commit: reconcile the existing element tree in place so unchanged
          // primitive elements keep their DOM identity (and focus/caret). The
          // effect re-run still disposes the prior run's view cleanups, so a
          // registered view leaf re-instantiates with fresh props as before.
          // Snapshot the anchors a view previously registered before this
          // commit's own render/patch may replace them, so a live child
          // mounted at one can be reconciled afterward instead of orphaned.
          const oldAnchors = new Map(anchors);
          const patched = patchNode(content, previous, next, views, anchors);
          if (patched !== content) {
            rootContainer.replaceChild(patched, content);
            content = patched;
          }
          reconcileAnchoredChildren(root, oldAnchors);
        }
        previous = next;
      });
      const listeners: { type: string; listener: EventListener }[] = [];
      root = {
        rootContainer,
        identity,
        disposed: false,
        listeners,
        anchors,
        childrenByAnchor: new Map(),
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
    parentContainer.appendChild(root.rootContainer);
    return root;
  }

  const renderer: SolidRenderer = {
    container: host,

    createRoot(identity: string, node: RenderNode): AdapterRoot {
      const root = mountRootInto(host, identity, node);
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
        !parentRoot.rootContainer.contains(anchorElement)
      ) {
        throw new Error(
          `Velkren: no anchor named ${JSON.stringify(anchor)} was registered on the parent root`,
        );
      }
      const root = mountRootInto(anchorElement, identity, node);
      root.mountedAt = { parent: parentRoot, anchor };
      parentRoot.childrenByAnchor.set(anchor, root);
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
      disposeRoot(asRoot(root));
    },

    registerInteraction(
      root: AdapterRoot,
      type: string,
      deliver: (snapshot: JsonObject) => void,
    ): InteractionRegistration {
      const adapterRoot = asRoot(root);
      const listener: EventListener = (event) => {
        // A child root's container can be nested inside this one (mounted via
        // mountChild); an interaction inside it still bubbles here natively.
        // Ignore it if the nearest identity-bearing ancestor is not this
        // container -- it belongs to that more deeply nested root instead.
        if (!belongsToContainer(event.target, adapterRoot.rootContainer)) {
          return;
        }
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

/** A child mounted at a named anchor lost its home because a commit's
 * rebuilt view stopped exposing that anchor at all. Reported through the
 * same ambient failure channel `@velkren/element`'s membrane boundary uses
 * (`globalThis.reportError`, falling back to `console.error`) rather than
 * silently discarding the child. */
function reportAnchorLost(anchor: string): void {
  const error = new Error(
    `Velkren: anchor ${JSON.stringify(anchor)} was removed while it still hosted a mounted child; the child has been released`,
  );
  const report = (globalThis as { reportError?: (value: unknown) => void })
    .reportError;
  if (typeof report === "function") report(error);
  else console.error(error);
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
 * Build a node's content element from scratch. The registry-aware builder used
 * for the initial mount and whenever a node must be (re)created on commit: a
 * view node is resolved by `viewId` and rendered as a self-contained leaf (raw
 * `node.props` as props; a view node has no children of its own to project);
 * a primitive node builds the DOM element with its attributes and children
 * recursively, never consulting the registry.
 */
function renderNodeElement(
  node: RenderNode,
  views: SolidViewRegistry,
  anchors: Map<string, HTMLElement>,
): HTMLElement {
  if (isViewNode(node)) {
    const view = views[node.viewId];
    if (view === undefined) {
      throw new Error(
        `Velkren: no view registered for viewId ${JSON.stringify(node.viewId)}`,
      );
    }
    return view(node.props, {
      registerAnchor(name, element) {
        anchors.set(name, element);
      },
    });
  }
  const element = document.createElement(node.kind);
  applyAttributes(element, node.attributes);
  element.replaceChildren(
    ...node.children.map((child) => renderNodeElement(child, views, anchors)),
  );
  return element;
}

/**
 * Reconcile `el` (built from `oldNode`) toward `newNode` in place, returning the
 * element to occupy this position. A primitive element whose `kind` is unchanged
 * keeps its DOM identity and is patched in place; a `kind` change, a variant
 * change (primitive<->view), or a view node on either side (an opaque leaf fed
 * plain `props`, always re-instantiated on commit) is rebuilt via
 * `renderNodeElement`, and the caller swaps it into its parent.
 */
function patchNode(
  el: HTMLElement,
  oldNode: RenderNode,
  newNode: RenderNode,
  views: SolidViewRegistry,
  anchors: Map<string, HTMLElement>,
): HTMLElement {
  if (isViewNode(oldNode) || isViewNode(newNode)) {
    return renderNodeElement(newNode, views, anchors);
  }
  if (oldNode.kind !== newNode.kind) {
    return renderNodeElement(newNode, views, anchors);
  }
  patchAttributes(el, oldNode.attributes, newNode.attributes);
  patchChildren(el, oldNode.children, newNode.children, views, anchors);
  return el;
}

/** A children array reconciles by key only when EVERY sibling carries one;
 * a mixed or fully-unkeyed array always takes the positional path. */
function isKeyedList(children: readonly RenderNode[]): boolean {
  return (
    children.length > 0 && children.every((child) => child.key !== undefined)
  );
}

/**
 * Reconcile a primitive element's children. When neither side is a fully-keyed
 * list, children reconcile by index: patch the common prefix in place, append
 * built elements for new tail nodes, and remove trailing elements for dropped
 * nodes. When either side is fully keyed, delegate to `patchKeyedChildren`
 * instead, since a keyed list's children must reconcile by identity, not
 * position (an inserted/removed/reordered item elsewhere in the list must not
 * shift every following item's DOM element).
 */
function patchChildren(
  parent: HTMLElement,
  oldChildren: readonly RenderNode[],
  newChildren: readonly RenderNode[],
  views: SolidViewRegistry,
  anchors: Map<string, HTMLElement>,
): void {
  if (isKeyedList(oldChildren) || isKeyedList(newChildren)) {
    patchKeyedChildren(parent, oldChildren, newChildren, views, anchors);
    return;
  }
  const common = Math.min(oldChildren.length, newChildren.length);
  for (let i = 0; i < common; i++) {
    const existing = parent.children[i] as HTMLElement;
    const patched = patchNode(
      existing,
      oldChildren[i]!,
      newChildren[i]!,
      views,
      anchors,
    );
    if (patched !== existing) parent.replaceChild(patched, existing);
  }
  for (let i = common; i < newChildren.length; i++) {
    parent.appendChild(renderNodeElement(newChildren[i]!, views, anchors));
  }
  while (parent.children.length > newChildren.length) {
    parent.removeChild(parent.lastElementChild!);
  }
}

/**
 * Reconcile a children array by key rather than position. Matched keys keep
 * their DOM element (patched in place, or rebuilt if `patchNode` decides the
 * kind/variant changed); unmatched new keys get a freshly built element.
 *
 * The old side is not guaranteed to have been fully keyed itself -- a caller
 * committing a `RenderNode` directly (e.g. a `state-binding` derivation)
 * bypasses template-authoring's key validation, so a children array can
 * legally transition between unkeyed and fully-keyed across a single commit.
 * To avoid leaking stale DOM elements across that transition (or across a
 * duplicate old key, which this unchecked boundary also permits), the removal
 * step below sweeps every current child element not reused by a match, not
 * only elements that were previously keyed.
 */
function patchKeyedChildren(
  parent: HTMLElement,
  oldChildren: readonly RenderNode[],
  newChildren: readonly RenderNode[],
  views: SolidViewRegistry,
  anchors: Map<string, HTMLElement>,
): void {
  const oldByKey = new Map<
    string,
    { node: RenderNode; element: HTMLElement }
  >();
  oldChildren.forEach((child, i) => {
    if (child.key !== undefined) {
      oldByKey.set(child.key, {
        node: child,
        element: parent.children[i] as HTMLElement,
      });
    }
  });

  // A key already claimed by an earlier new child (a duplicate key within
  // `newChildren`, only reachable through the unchecked `commit()` boundary)
  // must not be matched again -- reusing the same old element for two new
  // positions would make one DOM node occupy two slots in `nextElements`,
  // silently dropping a row rather than merely leaving an unspecified winner.
  const claimed = new Set<string>();
  const reused = new Set<HTMLElement>();
  const nextElements = newChildren.map((newChild) => {
    const match =
      newChild.key !== undefined && !claimed.has(newChild.key)
        ? oldByKey.get(newChild.key)
        : undefined;
    if (newChild.key !== undefined) claimed.add(newChild.key);
    const element =
      match === undefined
        ? renderNodeElement(newChild, views, anchors)
        : patchNode(match.element, match.node, newChild, views, anchors);
    reused.add(element);
    return element;
  });

  // Snapshot before removing: `parent.children` is a live HTMLCollection that
  // would skip entries if we removed while iterating it directly.
  for (const element of Array.from(parent.children) as HTMLElement[]) {
    if (!reused.has(element)) element.remove();
  }

  let refNode: ChildNode | null = parent.firstChild;
  for (const element of nextElements) {
    if (element === refNode) {
      refNode = refNode.nextSibling;
    } else {
      parent.insertBefore(element, refNode);
    }
  }
}

/**
 * Tags whose `value` IDL property is a string mirroring the HTML "dirty value
 * flag" semantics this adapter needs to respect. Deliberately narrower than
 * "has a `value` property at all": `<li>`, `<meter>`, and `<progress>` also
 * have a settable `value`, but it is a *numeric* WebIDL property (`long` or
 * `double`) that silently coerces a non-numeric string to `0`/`NaN` rather
 * than storing it — assigning through it would corrupt, not preserve, an
 * ordinary string attribute value.
 */
const CONTROLLED_VALUE_TAGS = new Set(["input", "textarea", "select"]);

/**
 * Set only the attributes whose stringified value changed and remove attributes
 * absent from `newAttributes`, leaving the element identity intact. `value` on
 * an `input`/`textarea`/`select` element is applied as a live DOM property
 * instead (see `applyValueProperty`), since `setAttribute` stops reaching the
 * live value the instant the HTML "dirty value flag" is set by a user edit.
 */
function patchAttributes(
  element: HTMLElement,
  oldAttributes: JsonObject,
  newAttributes: JsonObject,
): void {
  const controlledValue = CONTROLLED_VALUE_TAGS.has(
    element.tagName.toLowerCase(),
  );
  for (const [key, value] of Object.entries(newAttributes)) {
    const next = stringifyAttribute(value);
    if (key === "value" && controlledValue) {
      applyValueProperty(element as HTMLInputElement, next);
      continue;
    }
    if (element.getAttribute(key) !== next) element.setAttribute(key, next);
  }
  for (const key of Object.keys(oldAttributes)) {
    if (key in newAttributes) continue;
    if (key === "value" && controlledValue) {
      applyValueProperty(element as HTMLInputElement, "");
      continue;
    }
    element.removeAttribute(key);
  }
}

/**
 * Apply `next` to `element.value` as a live DOM property: skip the assignment
 * when it already holds `next` (avoids disturbing the caret on a redundant
 * re-commit), and otherwise preserve the current text selection across the
 * assignment, clamped to the new length. Selection access is guarded because
 * some `<input>` types (number, email, date, ...) throw on
 * `selectionStart`/`selectionEnd`/`setSelectionRange` per the HTML Standard.
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
function normalizeOptions(options?: HTMLElement | SolidRendererOptions): {
  container: HTMLElement | undefined;
  views: SolidViewRegistry;
} {
  if (options == null) return { container: undefined, views: {} };
  if ("nodeType" in options) return { container: options, views: {} };
  return { container: options.container, views: options.views ?? {} };
}

function applyAttributes(element: HTMLElement, attributes: JsonObject): void {
  const controlledValue = CONTROLLED_VALUE_TAGS.has(
    element.tagName.toLowerCase(),
  );
  for (const [key, value] of Object.entries(attributes)) {
    const next = stringifyAttribute(value);
    if (key === "value" && controlledValue) {
      applyValueProperty(element as HTMLInputElement, next);
      continue;
    }
    element.setAttribute(key, next);
  }
}

function stringifyAttribute(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** A membrane configuration bound to the Solid renderer. */
export type MembraneConfig = MembraneConfigCore<SolidRenderer>;
/** What a Solid membrane hands its factory. */
export type MembraneMountContext = MembraneMountContextCore<SolidRenderer>;

/**
 * Register a custom element that projects a Velkren composition on the Solid
 * renderer. A thin wrapper over the shared, renderer-agnostic membrane core in
 * `@velkren/element`, binding it to `createSolidRenderer`.
 */
export function defineVelkrenElement(
  tag: string,
  config: MembraneConfig,
): void {
  defineMembraneElement(tag, config, createSolidRenderer);
}
