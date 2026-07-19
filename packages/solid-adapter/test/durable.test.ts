// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  createComponentClass,
  createComponentRuntime,
  createEventClass,
  createEventRuntime,
  createInteractionBinding,
  createProjectionRuntime,
  createRuntime,
  createTemplateClass,
  createTemplateRuntime,
  eventField,
  type JsonObject,
  type RenderNode,
  type TemplateNode,
} from "@velkren/core";
import {
  defineVelkrenElement,
  type MembraneConfig,
  type MembraneMount,
} from "../src/index.js";

/**
 * A host-owned document service: a plain application object holding the shared
 * state. It is owned by no runtime, so disposing any view's runtime never touches
 * it — durability lives here, per Velkren's "applications own services" stance.
 */
interface DocService {
  get(): string;
  set(value: string): void;
  subscribe(listener: () => void): () => void;
  listenerCount(): number;
}

function makeDocService(initial: string): DocService {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: string): void {
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size,
  };
}

const docClass = createComponentClass("doc.view", () => ({}));
const edited = createEventClass("doc.edited", {
  value: eventField((value) => typeof value === "string"),
});

function renderNode(
  kind: string,
  attributes: JsonObject = {},
  children: RenderNode[] = [],
): RenderNode {
  return { kind, attributes, children, slots: {} };
}

function docRender(value: string): RenderNode {
  return renderNode("section", { "data-doc": value }, [renderNode("button")]);
}

function docNode(value: string): TemplateNode {
  return {
    kind: "section",
    attributes: { "data-doc": value },
    children: [{ kind: "button" }],
  };
}

function docTemplate(value: string) {
  return createTemplateClass("doc.view.default", {
    component: "component/doc.view",
    roots: { main: docNode(value) },
  });
}

interface DurableRecords {
  readonly disposed: string[];
  readonly mounted: string[];
}

function makeRecords(): DurableRecords {
  return { disposed: [], mounted: [] };
}

/**
 * An ephemeral membrane view over a host-owned service. Its factory mints a
 * runtime, renders the service's value, subscribes for cross-view updates, and
 * on a button interaction writes a new value back to the service. Detach disposes
 * only this view's runtime and its subscription — the service and its state stay.
 */
function docView(service: DocService, records: DurableRecords): MembraneConfig {
  return {
    async mount({ renderer, element }): Promise<MembraneMount> {
      const id = element.getAttribute("view-id") ?? "?";
      const runtime = createRuntime({ id: `view-${id}` });
      const components = createComponentRuntime(runtime);
      const templates = createTemplateRuntime(runtime);
      const events = createEventRuntime(runtime, {
        traceSink(record) {
          if (record.classId === edited.id && record.phase === "completed") {
            const value = record.snapshot?.value;
            if (typeof value === "string") service.set(value);
          }
        },
      });
      const projection = createProjectionRuntime(runtime, renderer);
      const interactions = createInteractionBinding(
        runtime,
        projection,
        events,
      );
      components.register(docClass);
      templates.register(docTemplate(service.get()));
      events.register(edited);

      const component = await components.create(docClass.id);
      const projected = await projection.mount(
        component,
        templates.resolvePlan(component),
      );
      const root = projected.roots.main;
      if (root === undefined)
        throw new Error("doc view root was not projected");

      // Cross-view sync: re-commit this view when the shared service changes.
      const unsubscribe = service.subscribe(() => {
        projection.commit(root, docRender(service.get()));
      });
      // An interaction in this view writes a new value into the shared service.
      interactions.bind(root, "click", edited, () => ({
        value: `edited-by-${id}`,
      }));
      records.mounted.push(id);

      return {
        async dispose(): Promise<void> {
          records.disposed.push(id);
          unsubscribe();
          await component.release();
          await projected.release();
        },
      };
    },
  };
}

async function waitFor(predicate: () => boolean, steps = 50): Promise<void> {
  for (let i = 0; i < steps; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!predicate()) throw new Error("waitFor timed out");
}

function docValue(element: HTMLElement): string | null {
  return element.querySelector("[data-doc]")?.getAttribute("data-doc") ?? null;
}

async function placeView(
  tag: string,
  id: string,
  records: DurableRecords,
): Promise<HTMLElement> {
  const element = document.createElement(tag);
  element.setAttribute("view-id", id);
  document.body.appendChild(element);
  await waitFor(() => records.mounted.includes(id));
  return element;
}

describe("durable multi-view via a host-owned service", () => {
  it("syncs an edit across views and survives a view's disposal", async () => {
    const service = makeDocService("v0");
    const records = makeRecords();
    defineVelkrenElement("doc-view-a", docView(service, records));

    const a = await placeView("doc-view-a", "a", records);
    const b = await placeView("doc-view-a", "b", records);
    expect(docValue(a)).toBe("v0");
    expect(docValue(b)).toBe("v0");

    // An edit in view A writes to the service; both views re-render.
    a.querySelector("button")?.dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    await waitFor(() => docValue(b) === "edited-by-a");
    expect(docValue(a)).toBe("edited-by-a");

    // Destroy view A: only its runtime is released; the service and its state
    // survive, and view B stays live.
    a.remove();
    await waitFor(() => records.disposed.includes("a"));
    expect(records.disposed).toEqual(["a"]);
    expect(service.get()).toBe("edited-by-a");
    expect(docValue(b)).toBe("edited-by-a");

    // View B can still edit the surviving service, proving it stays live.
    b.querySelector("button")?.dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    await waitFor(() => docValue(b) === "edited-by-b");
    expect(service.get()).toBe("edited-by-b");
  });

  it("lets a newly attached view read the current state", async () => {
    const service = makeDocService("start");
    const records = makeRecords();
    defineVelkrenElement("doc-view-late", docView(service, records));

    service.set("changed-before-attach");
    const late = await placeView("doc-view-late", "late", records);
    expect(docValue(late)).toBe("changed-before-attach");
  });

  it("removes a disposed view's subscription", async () => {
    const service = makeDocService("s0");
    const records = makeRecords();
    defineVelkrenElement("doc-view-unsub", docView(service, records));

    const only = await placeView("doc-view-unsub", "only", records);
    expect(service.listenerCount()).toBe(1);

    only.remove();
    await waitFor(() => records.disposed.includes("only"));

    // Disposal removed the view's subscription: the service has no listeners, and
    // a later change reaches no view (and does not error).
    expect(service.listenerCount()).toBe(0);
    service.set("after-dispose");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(docValue(only)).not.toBe("after-dispose");
  });
});
