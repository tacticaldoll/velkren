import type { JsonObject } from "@velkren/core";

/**
 * `@velkren/element` — the renderer-agnostic custom-element membrane core. It
 * imports no renderer (no Solid, no React); it depends only on `@velkren/core`
 * types and the DOM, and is parameterized by an injected renderer factory. Each
 * adapter binds it to its own renderer with a thin wrapper.
 */

/**
 * What a membrane hands to its factory: a renderer already bound to the placed
 * element as its container (the renderer's per-root container carries identity
 * and the interaction listener), the element itself, and a helper to relay a
 * boundary event outward. `R` is the concrete renderer type an adapter injects.
 */
export interface MembraneMountContext<R> {
  readonly renderer: R;
  readonly element: HTMLElement;
  /**
   * Emit a boundary event outward as a `CustomEvent` on the host element:
   * bubbling, non-cancelable, with a frozen `detail`. The host factory wires this
   * to its own event observation; the membrane owns the DOM mechanics while the
   * host owns the internal-event-to-outward-name mapping. `preventDefault` carries
   * no path back to the runtime.
   */
  readonly dispatchBoundaryEvent: (name: string, detail: JsonObject) => void;
  /**
   * Register a handler for a declared `observedAttributes` name. The handler
   * fires immediately with the attribute's current value (or `null` if absent),
   * then again on every later change. The membrane relays the raw string
   * unchanged — it does not validate or transform it. Returns an unsubscribe
   * function.
   */
  readonly onAttributeChange: (
    name: string,
    handler: AttributeChangeHandler,
  ) => () => void;
  /**
   * Register a handler for a declared `dataProperties` name. The handler
   * fires immediately with the property's current assigned value (`undefined`
   * if nothing has been assigned yet), then again on every later assignment.
   * The membrane relays the raw assigned value unchanged — it does not
   * validate or snapshot it. Returns an unsubscribe function.
   */
  readonly onPropertyAssign: (
    name: string,
    handler: PropertyAssignHandler,
  ) => () => void;
}

/** A handler for an inbound observed-attribute crossing. See
 * {@link MembraneMountContext.onAttributeChange}. */
export type AttributeChangeHandler = (value: string | null) => void;

/** A handler for an inbound data-property crossing. See
 * {@link MembraneMountContext.onPropertyAssign}. */
export type PropertyAssignHandler = (value: unknown) => void;

/** Invoke a crossing handler, reporting a throw through the membrane's
 * failure channel instead of letting it propagate into the DOM callback that
 * triggered it (`attributeChangedCallback` or a property setter). */
function invokeCrossingHandler<Value>(
  handler: (value: Value) => void,
  value: Value,
): void {
  try {
    handler(value);
  } catch (error) {
    reportMembraneError(error);
  }
}

/**
 * The handle a membrane factory returns. The membrane calls `dispose` once, on
 * confirmed detach, to release exactly what the factory created. A rejected
 * `dispose` surfaces through the membrane's failure channel; it is never
 * swallowed.
 */
export interface MembraneMount {
  dispose(): void | Promise<void>;
}

/**
 * A host-authored membrane configuration. `mount` composes a Velkren runtime on
 * the supplied renderer and returns a `MembraneMount`. The factory mints the
 * composition (a fresh runtime) it owns — ephemeral: the membrane disposes it
 * when the element is confirmed detached.
 */
export interface MembraneConfig<R> {
  mount(
    context: MembraneMountContext<R>,
  ): MembraneMount | Promise<MembraneMount>;
  /**
   * Opt into a shadow-DOM surface for style encapsulation. Default (absent or
   * `false`) is light DOM. `true` attaches an `open` shadow root; `"open"` or
   * `"closed"` selects the mode. The projection, identity, and interaction
   * listener move inside the shadow root; outward events still dispatch on the
   * host element.
   */
  readonly shadow?: boolean | "open" | "closed";
  /**
   * Interior styles adopted into the shadow root (CSS text). Only meaningful with
   * `shadow`. The membrane injects exactly this and never copies the host page's
   * global stylesheets across the boundary.
   */
  readonly styles?: string;
  /**
   * HTML attribute names the membrane observes. Each named attribute's
   * current value (or `null` when absent) crosses inward to any handler
   * registered through {@link MembraneMountContext.onAttributeChange}. Absent
   * or empty: no attribute crossing.
   */
  readonly observedAttributes?: readonly string[];
  /**
   * Property names the membrane defines an accessor for on the element
   * instance. Assigning a declared name (`element.name = value`) crosses the
   * raw value inward to any handler registered through
   * {@link MembraneMountContext.onPropertyAssign}. A property name not
   * listed here is never intercepted — it behaves as ordinary `HTMLElement`
   * property assignment. Absent or empty: no property crossing.
   */
  readonly dataProperties?: readonly string[];
}

/** A renderer factory: binds a renderer to a container the membrane owns. */
export type RendererFactory<R> = (options: { container: HTMLElement }) => R;

interface MembraneStatics {
  membraneConfig?: MembraneConfig<unknown>;
  membraneRenderer?: RendererFactory<unknown>;
}

/** Surface a membrane failure without swallowing it; never throws into a callback. */
function reportMembraneError(error: unknown): void {
  const report = (globalThis as { reportError?: (value: unknown) => void })
    .reportError;
  if (typeof report === "function") report(error);
  else console.error(error);
}

/** The generic membrane element class, built lazily so `HTMLElement` (a DOM
 * global absent in Node) is only evaluated where the DOM exists — inside
 * `defineMembraneElement`, which a host calls in a browser. */
let membraneBase: CustomElementConstructor | undefined;

function getMembraneBase(): CustomElementConstructor {
  if (membraneBase !== undefined) return membraneBase;
  class VelkrenMembraneElement extends HTMLElement {
    /** The platform's own opt-in mechanism: only attributes named here fire
     * `attributeChangedCallback`. Read from the per-tag config, which is
     * already attached to this specific subclass before `customElements.define`
     * runs (the point at which the platform reads this getter). */
    static get observedAttributes(): string[] {
      const statics = this as unknown as MembraneStatics;
      return statics.membraneConfig?.observedAttributes !== undefined
        ? [...statics.membraneConfig.observedAttributes]
        : [];
    }

    /** The in-flight or resolved mount for the current generation; undefined
     * when nothing is mounted. */
    #mount: Promise<MembraneMount | undefined> | undefined;
    /** Bumped only on a fresh mount, so a stale deferred release bails. A move
     * (disconnect+reconnect within the grace window) does not bump it. */
    #generation = 0;
    /** True while a deferred release is pending; a reconnect clears it. */
    #releaseQueued = false;
    /** The wrapper inside the shadow root, once attached; the renderer container
     * in shadow mode. Attached once and reused across mount cycles. */
    #shadowContainer: HTMLElement | undefined;
    /** Current value of each observed attribute, independent of mount
     * generation — describes the element's current DOM state, not any one
     * mount's view of it. */
    #attributeValues = new Map<string, string | null>();
    /** Current value of each declared data property, independent of mount
     * generation, for the same reason. */
    #propertyValues = new Map<string, unknown>();
    /** Handlers registered by the current mount for each observed attribute.
     * Reset to empty on every fresh mount so a disposed mount's handler
     * cannot fire into a new composition's state; untouched across a move. */
    #attributeHandlers = new Map<string, Set<AttributeChangeHandler>>();
    /** Handlers registered by the current mount for each declared data
     * property. Same fresh-mount reset, same move exemption. */
    #propertyHandlers = new Map<string, Set<PropertyAssignHandler>>();

    constructor() {
      super();
      // Data-property accessors are defined here, not in connectedCallback,
      // because a host may assign a property immediately after
      // document.createElement — before the element is ever connected. The
      // per-tag config is already available: construction only happens after
      // customElements.define, by which point defineMembraneElement has
      // already attached it to this constructor.
      const { config } = this.#statics();
      for (const name of config.dataProperties ?? []) {
        Object.defineProperty(this, name, {
          configurable: true,
          enumerable: true,
          get: (): unknown => this.#propertyValues.get(name),
          set: (value: unknown): void => {
            this.#propertyValues.set(name, value);
            this.#dispatchProperty(name, value);
          },
        });
      }
    }

    #dispatchAttribute(name: string, value: string | null): void {
      const handlers = this.#attributeHandlers.get(name);
      if (handlers === undefined) return;
      for (const handler of handlers) invokeCrossingHandler(handler, value);
    }

    #dispatchProperty(name: string, value: unknown): void {
      const handlers = this.#propertyHandlers.get(name);
      if (handlers === undefined) return;
      for (const handler of handlers) invokeCrossingHandler(handler, value);
    }

    attributeChangedCallback(
      name: string,
      _oldValue: string | null,
      newValue: string | null,
    ): void {
      this.#attributeValues.set(name, newValue);
      this.#dispatchAttribute(name, newValue);
    }

    #statics(): {
      config: MembraneConfig<unknown>;
      createRenderer: RendererFactory<unknown>;
    } {
      const statics = this.constructor as MembraneStatics;
      if (
        statics.membraneConfig === undefined ||
        statics.membraneRenderer === undefined
      ) {
        throw new Error("Velkren membrane element has no configuration");
      }
      return {
        config: statics.membraneConfig,
        createRenderer: statics.membraneRenderer,
      };
    }

    /** The renderer container: the element itself in light mode, or a wrapper
     * inside a lazily-attached shadow root in shadow mode. */
    #container(config: MembraneConfig<unknown>): HTMLElement {
      if (!config.shadow) return this;
      if (this.#shadowContainer === undefined) {
        const mode = config.shadow === true ? "open" : config.shadow;
        const root = this.attachShadow({ mode });
        if (config.styles !== undefined) {
          const style = document.createElement("style");
          style.textContent = config.styles;
          root.appendChild(style);
        }
        const wrapper = document.createElement("div");
        root.appendChild(wrapper);
        this.#shadowContainer = wrapper;
      }
      return this.#shadowContainer;
    }

    connectedCallback(): void {
      // A reconnect within the grace window cancels a pending release and keeps
      // the existing projection.
      this.#releaseQueued = false;
      if (this.#mount !== undefined) return;
      // Fresh mount: bind a renderer to this element as its container and let
      // the host factory compose. connectedCallback only schedules — the mount
      // resolves on its own microtasks, so a DOM signal is a request, not the
      // definition of lifecycle.
      this.#generation += 1;
      // A disposed mount's handlers must not fire into a new composition's
      // state; the current attribute/property values themselves are not
      // reset, so the new mount's first registration sees the element's
      // current state rather than null/undefined.
      this.#attributeHandlers = new Map();
      this.#propertyHandlers = new Map();
      const { config, createRenderer } = this.#statics();
      const renderer = createRenderer({ container: this.#container(config) });
      const dispatchBoundaryEvent = (
        name: string,
        detail: JsonObject,
      ): void => {
        // The membrane owns the DOM mechanics: notification, not negotiation.
        // The arrow captures the element lexically as `this`.
        this.dispatchEvent(
          new CustomEvent(name, {
            detail: Object.freeze(detail),
            bubbles: true,
            cancelable: false,
          }),
        );
      };
      const onAttributeChange = (
        name: string,
        handler: AttributeChangeHandler,
      ): (() => void) => {
        let handlers = this.#attributeHandlers.get(name);
        if (handlers === undefined) {
          handlers = new Set();
          this.#attributeHandlers.set(name, handlers);
        }
        handlers.add(handler);
        invokeCrossingHandler(handler, this.#attributeValues.get(name) ?? null);
        const registered = handlers;
        return () => {
          registered.delete(handler);
        };
      };
      const onPropertyAssign = (
        name: string,
        handler: PropertyAssignHandler,
      ): (() => void) => {
        let handlers = this.#propertyHandlers.get(name);
        if (handlers === undefined) {
          handlers = new Set();
          this.#propertyHandlers.set(name, handlers);
        }
        handlers.add(handler);
        invokeCrossingHandler(handler, this.#propertyValues.get(name));
        const registered = handlers;
        return () => {
          registered.delete(handler);
        };
      };
      this.#mount = Promise.resolve(
        config.mount({
          renderer,
          element: this,
          dispatchBoundaryEvent,
          onAttributeChange,
          onPropertyAssign,
        }),
      ).catch((error: unknown) => {
        reportMembraneError(error);
        return undefined;
      });
    }

    disconnectedCallback(): void {
      if (this.#mount === undefined) return;
      this.#releaseQueued = true;
      const generation = this.#generation;
      // Defer the release one grace window (a microtask). A move re-connects
      // synchronously and clears the flag before this runs.
      queueMicrotask(() => {
        if (!this.#releaseQueued || this.#generation !== generation) return;
        // A disposal failure surfaces through the failure channel rather than
        // becoming an unhandled rejection; it is never swallowed.
        void this.#release(generation).catch(reportMembraneError);
      });
    }

    async #release(generation: number): Promise<void> {
      const mount = this.#mount;
      if (mount === undefined || this.#generation !== generation) return;
      // Detach state before awaiting so a later reconnect starts a fresh mount
      // and this release runs exactly once (idempotent, no double dispose).
      this.#mount = undefined;
      this.#releaseQueued = false;
      const resolved = await mount;
      if (resolved !== undefined) await resolved.dispose();
    }
  }
  membraneBase = VelkrenMembraneElement;
  return membraneBase;
}

/**
 * Register a custom element that projects a Velkren composition, binding the
 * shared membrane core to the injected `createRenderer`. One registration
 * authorizes; declarative placement of `tag` then creates membranes, mirroring
 * `customElements.define`. Each placed element mints and owns its composition
 * (ephemeral), disposes it on confirmed detach, and survives a DOM move.
 */
export function defineMembraneElement<R>(
  tag: string,
  config: MembraneConfig<R>,
  createRenderer: RendererFactory<R>,
): void {
  if (customElements.get(tag) !== undefined) {
    throw new Error(
      `Velkren element tag ${JSON.stringify(tag)} is already defined`,
    );
  }
  const Base = getMembraneBase();
  const ElementClass = class extends Base {};
  const statics = ElementClass as MembraneStatics;
  statics.membraneConfig = config;
  statics.membraneRenderer = createRenderer;
  customElements.define(tag, ElementClass);
}
