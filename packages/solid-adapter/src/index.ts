import { createRenderEffect, createRoot, createSignal } from "solid-js";
import {
  PROJECTION_IDENTITY_ATTRIBUTE,
  type AdapterRoot,
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
  /** The DOM element under which projected roots are mounted. */
  readonly container: HTMLElement;
  /**
   * Attach a native interaction listener to a root. The handler receives an
   * immutable snapshot; the live DOM node and native event never cross out.
   */
  bindInteraction(
    root: AdapterRoot,
    type: string,
    handler: (snapshot: JsonObject) => void,
  ): void;
}

interface SolidAdapterRoot {
  readonly element: HTMLElement;
  readonly identity: string;
  setNode(node: RenderNode): void;
  dispose(): void;
  disposed: boolean;
  readonly listeners: { type: string; listener: EventListener }[];
}

/** Create an in-DOM SolidJS renderer implementing the core RendererPort. */
export function createSolidRenderer(container?: HTMLElement): SolidRenderer {
  const host = container ?? document.createElement("div");

  const asRoot = (root: AdapterRoot): SolidAdapterRoot =>
    root as SolidAdapterRoot;

  const renderer: SolidRenderer = {
    container: host,

    createRoot(identity: string, node: RenderNode): AdapterRoot {
      let root!: SolidAdapterRoot;
      createRoot((dispose) => {
        const element = document.createElement(node.kind);
        const [current, setNode] = createSignal<RenderNode>(node);
        createRenderEffect(() => {
          renderInto(element, current(), identity);
        });
        const listeners: { type: string; listener: EventListener }[] = [];
        root = {
          element,
          identity,
          disposed: false,
          listeners,
          setNode(next: RenderNode) {
            setNode(() => next);
          },
          dispose() {
            for (const { type, listener } of listeners) {
              element.removeEventListener(type, listener);
            }
            listeners.length = 0;
            dispose();
          },
        };
      });
      host.appendChild(root.element);
      return root;
    },

    commit(root: AdapterRoot, _identity: string, node: RenderNode): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      adapterRoot.setNode(node);
    },

    readIdentity(root: AdapterRoot): string | undefined {
      return (
        asRoot(root).element.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE) ??
        undefined
      );
    },

    removeRoot(root: AdapterRoot): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      adapterRoot.disposed = true;
      adapterRoot.dispose();
      adapterRoot.element.remove();
    },

    bindInteraction(
      root: AdapterRoot,
      type: string,
      handler: (snapshot: JsonObject) => void,
    ): void {
      const adapterRoot = asRoot(root);
      const listener: EventListener = (event) => {
        handler(snapshotNativeEvent(event));
      };
      adapterRoot.element.addEventListener(type, listener);
      adapterRoot.listeners.push({ type, listener });
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

function renderInto(
  element: HTMLElement,
  node: RenderNode,
  identity: string,
): void {
  applyAttributes(element, node.attributes);
  element.setAttribute(PROJECTION_IDENTITY_ATTRIBUTE, identity);
  element.replaceChildren(...node.children.map(buildElement));
}

function buildElement(node: RenderNode): HTMLElement {
  const element = document.createElement(node.kind);
  applyAttributes(element, node.attributes);
  element.replaceChildren(...node.children.map(buildElement));
  return element;
}

function applyAttributes(element: HTMLElement, attributes: JsonObject): void {
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, stringifyAttribute(value));
  }
}

function stringifyAttribute(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
