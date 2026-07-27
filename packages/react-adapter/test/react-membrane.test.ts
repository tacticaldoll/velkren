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
  createStateBinding,
  createStateRuntime,
  createTemplateClass,
  createTemplateRuntime,
  eventField,
  type RenderNode,
  type TemplateNode,
} from "@velkren/core";
import {
  defineVelkrenElement,
  type MembraneConfig,
  type MembraneMount,
} from "../src/index.js";

// The same membrane composition as the Solid validation — proving the shared
// core runs unchanged on the React adapter's renderer.
const panelClass = createComponentClass("react.panel", () => ({}));
const submitted = createEventClass("react.submitted", {
  editor: eventField((value) => typeof value === "string"),
});

function panelNode(): TemplateNode {
  return {
    kind: "section",
    attributes: {},
    children: [{ kind: "input" }, { kind: "button" }],
  };
}

function panelTemplate() {
  return createTemplateClass("react.panel.default", {
    component: "component/react.panel",
    roots: { main: panelNode() },
  });
}

interface Records {
  readonly emissions: string[];
  readonly disposed: string[];
  readonly mounted: string[];
}

function makeRecords(): Records {
  return { emissions: [], disposed: [], mounted: [] };
}

function editorMembrane(records: Records): MembraneConfig {
  return {
    async mount({
      renderer,
      element,
      dispatchBoundaryEvent,
    }): Promise<MembraneMount> {
      const id = element.getAttribute("editor-id") ?? "?";
      const runtime = createRuntime({ id: `react-${id}` });
      const components = createComponentRuntime(runtime);
      const templates = createTemplateRuntime(runtime);
      const events = createEventRuntime(runtime, {
        traceSink(record) {
          if (record.classId === submitted.id && record.phase === "completed") {
            const editor = record.snapshot?.editor;
            if (typeof editor === "string") records.emissions.push(editor);
            if (record.snapshot !== undefined) {
              dispatchBoundaryEvent("velkren:submitted", record.snapshot);
            }
          }
        },
      });
      const projection = createProjectionRuntime(runtime, renderer);
      const interactions = createInteractionBinding(
        runtime,
        projection,
        events,
      );
      components.register(panelClass);
      templates.register(panelTemplate());
      events.register(submitted);

      const panel = await components.create(panelClass.id);
      const projected = await projection.mount(
        panel,
        templates.resolvePlan(panel),
      );
      const root = projected.roots.main;
      if (root === undefined) throw new Error("panel root was not projected");
      interactions.bind(root, "click", submitted, () => ({ editor: id }));
      records.mounted.push(id);

      return {
        async dispose(): Promise<void> {
          records.disposed.push(id);
          await panel.release();
          await projected.release();
        },
      };
    },
  };
}

interface DataEditor {
  readonly label: string;
  readonly count: number;
}

function dataPanelNode(value: DataEditor): RenderNode {
  return {
    kind: "section",
    attributes: { label: value.label, count: String(value.count) },
    children: [
      { kind: "input", attributes: {}, children: [], slots: {} },
      { kind: "button", attributes: {}, children: [], slots: {} },
    ],
    slots: {},
  };
}

/** Same inbound-crossing fixture as the Solid membrane validation, proving
 * the shared @velkren/element core's attribute/property crossing behaves
 * identically on the React adapter's renderer. */
function editorMembraneWithData(records: Records): MembraneConfig {
  return {
    observedAttributes: ["label"],
    dataProperties: ["count"],
    async mount({
      renderer,
      onAttributeChange,
      onPropertyAssign,
    }): Promise<MembraneMount> {
      const runtime = createRuntime({
        id: `react-data-${records.mounted.length}`,
      });
      const components = createComponentRuntime(runtime);
      const templates = createTemplateRuntime(runtime);
      const projection = createProjectionRuntime(runtime, renderer);
      const state = createStateRuntime(runtime);
      const binding = createStateBinding(runtime, projection);
      components.register(panelClass);
      templates.register(panelTemplate());

      const panel = await components.create(panelClass.id);
      const projected = await projection.mount(
        panel,
        templates.resolvePlan(panel),
      );
      const root = projected.roots.main;
      if (root === undefined) throw new Error("panel root was not projected");

      const cell = state.create<DataEditor>({ label: "", count: 0 });
      binding.bind(root, cell, dataPanelNode);
      records.mounted.push("data");

      onAttributeChange("label", (value) => {
        cell.update((previous) => ({ ...previous, label: value ?? "" }));
      });
      onPropertyAssign("count", (value) => {
        if (value === undefined) return;
        cell.update((previous) => ({
          ...previous,
          count: typeof value === "number" ? value : Number(value),
        }));
      });

      return {
        async dispose(): Promise<void> {
          await panel.release();
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

function clickButton(element: HTMLElement): void {
  const button = element.querySelector("button");
  if (button === null) throw new Error("no button rendered in membrane");
  button.dispatchEvent(new Event("click", { bubbles: true }));
}

async function place(
  tag: string,
  id: string,
  records: Records,
): Promise<HTMLElement> {
  const element = document.createElement(tag);
  element.setAttribute("editor-id", id);
  document.body.appendChild(element);
  await waitFor(() => records.mounted.includes(id));
  return element;
}

describe("react element membrane", () => {
  it("mounts, isolates, relays, and disposes through the boundary on React", async () => {
    const records = makeRecords();
    defineVelkrenElement("react-editor", editorMembrane(records));

    const a = await place("react-editor", "a", records);
    const b = await place("react-editor", "b", records);
    expect(a.querySelector("button")).not.toBeNull();
    expect(b.querySelector("button")).not.toBeNull();

    // Interaction through the boundary emits the business event and relays an
    // outward CustomEvent that a host ancestor receives.
    const received: CustomEvent[] = [];
    const handler = (event: Event): void => {
      received.push(event as CustomEvent);
    };
    document.body.addEventListener("velkren:submitted", handler);
    try {
      clickButton(a);
      await waitFor(() => records.emissions.includes("a"));
      await waitFor(() => received.length > 0);
    } finally {
      document.body.removeEventListener("velkren:submitted", handler);
    }
    expect(received[0]?.detail).toEqual({ editor: "a" });
    expect(received[0]?.cancelable).toBe(false);

    clickButton(b);
    await waitFor(() => records.emissions.includes("b"));

    // Destroy one: only its work is released; the other stays live.
    a.remove();
    await waitFor(() => records.disposed.includes("a"));
    expect(records.disposed).toEqual(["a"]);

    clickButton(b);
    await waitFor(
      () => records.emissions.filter((id) => id === "b").length === 2,
    );
    expect(records.disposed).toEqual(["a"]);
  });

  it("crosses an observed attribute and a data property inward to drive state", async () => {
    const records = makeRecords();
    defineVelkrenElement("react-editor-data", editorMembraneWithData(records));

    const element = document.createElement("react-editor-data");
    document.body.appendChild(element);
    await waitFor(() => records.mounted.includes("data"));
    const section = (): HTMLElement | null => element.querySelector("section");

    expect(section()?.getAttribute("label")).toBe("");
    expect(section()?.getAttribute("count")).toBe("0");

    element.setAttribute("label", "hello");
    await waitFor(() => section()?.getAttribute("label") === "hello");

    (element as unknown as { count: number }).count = 5;
    await waitFor(() => section()?.getAttribute("count") === "5");
  });
});
