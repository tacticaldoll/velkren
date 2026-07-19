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
});
