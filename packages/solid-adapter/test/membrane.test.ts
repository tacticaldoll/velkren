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
  eventField,
  PROJECTION_IDENTITY_ATTRIBUTE,
  createTemplateRuntime,
  type TemplateNode,
} from "@velkren/core";
import {
  createSolidRenderer,
  defineVelkrenElement,
  type MembraneConfig,
  type MembraneMount,
} from "../src/index.js";

// A shared, portable definition set (reusable descriptions; registered
// per-runtime). The membrane's factory mints one runtime per element.
const panelClass = createComponentClass("editor.panel", () => ({}));
const submitted = createEventClass("editor.submitted", {
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
  return createTemplateClass("editor.panel.default", {
    component: "component/editor.panel",
    roots: { main: panelNode() },
  });
}

/** Observations shared across every membrane on the page. */
interface EditorRecords {
  readonly emissions: string[];
  readonly disposed: string[];
}

/**
 * A membrane configuration whose factory mints a fresh runtime per element
 * (ephemeral), composes the editor on the injected renderer, binds the button
 * click to the business event, and returns a disposer that releases what it
 * created. The editor id is read once from the element to tag observations.
 */
function editorMembrane(records: EditorRecords): MembraneConfig {
  return {
    async mount({
      renderer,
      element,
      dispatchBoundaryEvent,
    }): Promise<MembraneMount> {
      const id = element.getAttribute("editor-id") ?? "?";
      const runtime = createRuntime({ id: `editor-${id}` });
      const components = createComponentRuntime(runtime);
      const templates = createTemplateRuntime(runtime);
      const events = createEventRuntime(runtime, {
        traceSink(record) {
          if (record.classId === submitted.id && record.phase === "completed") {
            const editor = record.snapshot?.editor;
            if (typeof editor === "string") records.emissions.push(editor);
            // The host maps its internal event to an outward name and relays it
            // through the membrane's dispatch helper.
            if (record.snapshot !== undefined) {
              dispatchBoundaryEvent("velkren:submitted", record.snapshot);
            }
          }
        },
      });
      events.register(submitted);
      const projection = createProjectionRuntime(runtime, renderer);
      const interactions = createInteractionBinding(
        runtime,
        projection,
        events,
      );
      components.register(panelClass);
      templates.register(panelTemplate());

      const panel = await components.create(panelClass.id);
      const projected = await projection.mount(
        panel,
        templates.resolvePlan(panel),
      );
      const root = projected.roots.main;
      if (root === undefined) throw new Error("panel root was not projected");
      interactions.bind(root, "click", submitted, () => ({ editor: id }));

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

function rootIdentity(element: HTMLElement): string | null {
  return (
    element
      .querySelector(`[${PROJECTION_IDENTITY_ATTRIBUTE}]`)
      ?.getAttribute(PROJECTION_IDENTITY_ATTRIBUTE) ?? null
  );
}

async function placeEditor(tag: string, id: string): Promise<HTMLElement> {
  const element = document.createElement(tag);
  element.setAttribute("editor-id", id);
  document.body.appendChild(element);
  await waitFor(() => element.querySelector("button") !== null);
  return element;
}

describe("element membrane", () => {
  it("mounts a declaratively placed tag after one registration", async () => {
    const records: EditorRecords = { emissions: [], disposed: [] };
    defineVelkrenElement("velkren-editor-basic", editorMembrane(records));

    const editor = await placeEditor("velkren-editor-basic", "solo");
    expect(rootIdentity(editor)).not.toBeNull();

    clickButton(editor);
    await waitFor(() => records.emissions.includes("solo"));
    expect(records.emissions).toEqual(["solo"]);
  });

  it("isolates two membranes and disposes scope-locally", async () => {
    const records: EditorRecords = { emissions: [], disposed: [] };
    defineVelkrenElement("velkren-editor-pair", editorMembrane(records));

    const a = await placeEditor("velkren-editor-pair", "a");
    const b = await placeEditor("velkren-editor-pair", "b");

    // Distinct runtimes: identities do not collide through the shared tag.
    expect(rootIdentity(a)).not.toEqual(rootIdentity(b));

    clickButton(a);
    clickButton(b);
    await waitFor(
      () => records.emissions.includes("a") && records.emissions.includes("b"),
    );
    expect(records.emissions.sort()).toEqual(["a", "b"]);

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

  it("survives a DOM move without releasing", async () => {
    const records: EditorRecords = { emissions: [], disposed: [] };
    defineVelkrenElement("velkren-editor-move", editorMembrane(records));

    const holder = document.createElement("div");
    document.body.appendChild(holder);
    const editor = document.createElement("velkren-editor-move");
    editor.setAttribute("editor-id", "m");
    holder.appendChild(editor);
    await waitFor(() => editor.querySelector("button") !== null);
    const identityBefore = rootIdentity(editor);

    // Move: disconnect + reconnect within the grace window.
    document.body.appendChild(editor);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(records.disposed).toEqual([]);
    expect(rootIdentity(editor)).toEqual(identityBefore);

    clickButton(editor);
    await waitFor(() => records.emissions.includes("m"));
    expect(records.emissions).toEqual(["m"]);
    expect(records.disposed).toEqual([]);
  });

  it("rejects a duplicate tag registration", () => {
    const records: EditorRecords = { emissions: [], disposed: [] };
    defineVelkrenElement("velkren-editor-dup", editorMembrane(records));
    expect(() =>
      defineVelkrenElement("velkren-editor-dup", editorMembrane(records)),
    ).toThrow();
  });

  it("relays a boundary event outward as a bubbling, frozen CustomEvent", async () => {
    const records: EditorRecords = { emissions: [], disposed: [] };
    defineVelkrenElement("velkren-editor-out", editorMembrane(records));
    const editor = await placeEditor("velkren-editor-out", "z");

    // Listen on an ancestor to prove the event bubbles out of the element.
    const received: CustomEvent[] = [];
    const handler = (event: Event): void => {
      const custom = event as CustomEvent;
      custom.preventDefault(); // non-cancelable: must not steer anything
      received.push(custom);
    };
    document.body.addEventListener("velkren:submitted", handler);
    try {
      clickButton(editor);
      await waitFor(() => received.length > 0);
    } finally {
      document.body.removeEventListener("velkren:submitted", handler);
    }

    const event = received[0];
    if (event === undefined) throw new Error("no boundary event received");
    // Outward name is host-chosen, decoupled from the internal EventClass id.
    expect(event.type).toBe("velkren:submitted");
    expect(event.type).not.toBe(submitted.id);
    expect(event.bubbles).toBe(true);
    expect(event.cancelable).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(event.detail).toEqual({ editor: "z" });
    expect(Object.isFrozen(event.detail)).toBe(true);
  });

  it("surfaces a disposal failure without swallowing it", async () => {
    const slot = globalThis as { reportError?: (value: unknown) => void };
    const original = slot.reportError;
    const errors: unknown[] = [];
    slot.reportError = (value) => errors.push(value);
    try {
      defineVelkrenElement("velkren-editor-fail", {
        mount() {
          return {
            dispose() {
              throw new Error("boom");
            },
          };
        },
      });
      const element = document.createElement("velkren-editor-fail");
      document.body.appendChild(element);
      await new Promise((resolve) => setTimeout(resolve, 0));
      element.remove();
      await waitFor(() => errors.length > 0);
      expect(errors).toHaveLength(1);
    } finally {
      slot.reportError = original;
    }
  });

  it("keeps the membrane composition-agnostic (core stays host-blind)", () => {
    // The membrane surface is created purely from adapter/DOM primitives; it is
    // a projection surface, not an authority. A fresh renderer bound to an
    // element exposes only the neutral port plus the adapter's affordances.
    const element = document.createElement("div");
    const renderer = createSolidRenderer({ container: element });
    expect(typeof renderer.registerInteraction).toBe("function");
    expect(renderer.container).toBe(element);
  });
});
