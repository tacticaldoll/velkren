import { createElement, type ReactElement, type SyntheticEvent } from "react";
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

/**
 * The React renderer: a real-DOM `RendererPort` implementation driven by React's
 * reconciler through `react-dom/client`. React and DOM types live only in this
 * package; `@velkren/core` never imports them.
 */
export interface ReactRenderer extends RendererPort {
  /** The projected root element carrying `identity`, or undefined if removed. */
  elementForIdentity(identity: string): HTMLElement | undefined;
  /**
   * Drive a native interaction on the root carrying `identity` so React's own
   * delegated event system reports it, exercising every registered capture. A
   * no-op if the root was removed. This is a validation/dev affordance, not a
   * port op.
   */
  simulateInteraction(identity: string, type: string): void;
}

/** Deliver an immutable interaction snapshot inward through the port. */
type Deliver = (snapshot: JsonObject) => void;

/**
 * The adapter-owned, per-root registration store. A mutable Map the rendered
 * handlers read at event time so registration needs no re-render and survives a
 * commit's new render (the Map reference is stable across renders).
 */
type RegistrationMap = Map<string, Deliver>;

/**
 * React wires only DOM-event-named interaction types through its synthetic-event
 * system. Map the supported interaction types to their handler props; a
 * non-DOM-named custom type has no synthetic prop and is out of scope here.
 */
const INTERACTION_HANDLER_PROPS: Readonly<Record<string, string>> = {
  click: "onClick",
  input: "onInput",
};

interface ReactAdapterRoot {
  readonly container: HTMLElement;
  readonly reactRoot: Root;
  readonly identity: string;
  readonly registrations: RegistrationMap;
  disposed: boolean;
}

/** Create an in-DOM React renderer implementing the core RendererPort. */
export function createReactRenderer(container?: HTMLElement): ReactRenderer {
  const rootsByIdentity = new Map<string, ReactAdapterRoot>();

  const asRoot = (root: AdapterRoot): ReactAdapterRoot =>
    root as ReactAdapterRoot;

  const renderer: ReactRenderer = {
    createRoot(identity: string, node: RenderNode): AdapterRoot {
      // Each root owns a detached container attached under `document` so
      // `readIdentity`/queries resolve and React's delegated listener has a live
      // DOM ancestor to catch bubbling events.
      const host = container ?? document.body;
      const rootContainer = document.createElement("div");
      host.appendChild(rootContainer);
      const reactRoot = createReactRoot(rootContainer);
      const registrations: RegistrationMap = new Map();
      // Flush synchronously: the port contract reads the mounted DOM the instant
      // this returns, but `react-dom` otherwise only schedules the render.
      flushSync(() => {
        reactRoot.render(createElement(VelkrenTree, { node, registrations }));
      });
      // Identity is stamped imperatively (never a React prop): a re-render alone
      // would not restore an out-of-band-removed attribute.
      stampIdentity(rootContainer, identity);
      const root: ReactAdapterRoot = {
        container: rootContainer,
        reactRoot,
        identity,
        registrations,
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
          createElement(VelkrenTree, {
            node,
            registrations: adapterRoot.registrations,
          }),
        );
      });
      // Re-stamp: reconciliation updates content but does not re-apply the
      // identity attribute, so repair it here (commit-repair contract).
      stampIdentity(adapterRoot.container, adapterRoot.identity);
    },

    readIdentity(root: AdapterRoot): string | undefined {
      return (
        asRoot(root).container.firstElementChild?.getAttribute(
          PROJECTION_IDENTITY_ATTRIBUTE,
        ) ?? undefined
      );
    },

    removeRoot(root: AdapterRoot): void {
      const adapterRoot = asRoot(root);
      if (adapterRoot.disposed) return;
      adapterRoot.disposed = true;
      rootsByIdentity.delete(adapterRoot.identity);
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
      // No re-render: the rendered handler prop reads this Map at event time, so
      // recording interest is enough whether it happens before or after mount.
      adapterRoot.registrations.set(type, deliver);
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
      return (
        (adapterRoot.container.firstElementChild as HTMLElement | null) ??
        undefined
      );
    },

    simulateInteraction(identity: string, type: string): void {
      const adapterRoot = rootsByIdentity.get(identity);
      if (adapterRoot === undefined || adapterRoot.disposed) return;
      const host = adapterRoot.container.firstElementChild;
      if (host === null) return;
      // A native bubbling event: React's delegated listener on the container
      // turns it into the synthetic handler → the registered deliver.
      host.dispatchEvent(new Event(type, { bubbles: true }));
    },
  };

  return renderer;
}

/**
 * Capture selected synthetic-event fields as an immutable snapshot. The live DOM
 * node, synthetic event object, and React internals are never returned or
 * forwarded (mirrors the SolidJS `snapshotNativeEvent` boundary).
 */
export function snapshotReactEvent(event: SyntheticEvent): JsonObject {
  const target: unknown = event.target;
  const value =
    target !== null &&
    typeof target === "object" &&
    "value" in target &&
    typeof target.value === "string"
      ? target.value
      : null;
  return Object.freeze({ type: event.type, value });
}

interface VelkrenTreeProps {
  readonly node: RenderNode;
  readonly registrations: RegistrationMap;
}

/** Render a RenderNode tree with `React.createElement` (no JSX). */
function VelkrenTree({ node, registrations }: VelkrenTreeProps): ReactElement {
  return renderNode(node, registrations, true);
}

function renderNode(
  node: RenderNode,
  registrations: RegistrationMap,
  isRoot: boolean,
  key?: string,
): ReactElement {
  const props: Record<string, unknown> = {};
  if (key !== undefined) props.key = key;
  for (const [name, value] of Object.entries(node.attributes)) {
    props[translateAttribute(name)] = stringifyAttribute(value);
  }
  if (isRoot) {
    // Wire every supported handler prop up front so a later registration takes
    // effect without a re-render; each reads the adapter-owned Map at event time.
    for (const [type, handlerProp] of Object.entries(
      INTERACTION_HANDLER_PROPS,
    )) {
      props[handlerProp] = (event: SyntheticEvent): void => {
        registrations.get(type)?.(snapshotReactEvent(event));
      };
    }
  }
  const children = node.children.map((child, index) =>
    renderNode(child, registrations, false, String(index)),
  );
  return createElement(node.kind, props, ...children);
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
  const host = container.firstElementChild;
  if (host !== null) host.setAttribute(PROJECTION_IDENTITY_ATTRIBUTE, identity);
}
