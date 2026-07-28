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
  defineVelkrenElement as defineReactVelkrenElement,
  type MembraneConfig as ReactMembraneConfig,
} from "@velkren/react-adapter";
import {
  defineVelkrenElement as defineSolidVelkrenElement,
  type MembraneConfig as SolidMembraneConfig,
} from "@velkren/solid-adapter";
import {
  defineVelkrenElement as defineVueVelkrenElement,
  type MembraneConfig as VueMembraneConfig,
} from "@velkren/vue-adapter";

import { appendLog } from "../log.js";

/**
 * The membrane scenario's inner UI: a self-contained Panel with an input and
 * a button, following `editorMembrane()`'s ACTUAL pattern in each adapter's
 * own `test/membrane.test.ts` -- NOT `@velkren/neutral-composition-fixture`'s
 * exports, which produce a childless `<section>` with no clickable UI (an
 * adversarial review of the propose-stage design caught this before any of
 * this code was written).
 */
function panelNode(): TemplateNode {
  return {
    kind: "section",
    attributes: {},
    children: [{ kind: "input" }, { kind: "button" }],
  };
}

/** Listens once for a tag's outward `velkren:submitted` CustomEvent
 * (bubbling, per the membrane's own outward-event contract) and feeds the
 * page's shared activity log -- plain DOM code, independent of which
 * adapter's renderer produced the element. */
function logSubmissionsFor(tag: string, logList: HTMLElement): void {
  document.addEventListener("velkren:submitted", (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      target.tagName.toLowerCase() !== tag
    ) {
      return;
    }
    const detail = (event as CustomEvent).detail as
      { editor?: unknown } | undefined;
    appendLog(logList, `[${tag}] submitted by "${String(detail?.editor)}"`);
  });
}

export function registerSolidMembrane(logList: HTMLElement): void {
  const tag = "velkren-solid-widget";
  const panelClass = createComponentClass("solid-membrane.panel", () => ({}));
  const submitted = createEventClass("solid-membrane.submitted", {
    editor: eventField((value) => typeof value === "string"),
  });
  const config: SolidMembraneConfig = {
    async mount({ renderer, element, dispatchBoundaryEvent }) {
      const label = element.getAttribute("label") ?? tag;
      const runtime = createRuntime({
        id: `solid-membrane-${label.toLowerCase()}`,
      });
      const components = createComponentRuntime(runtime);
      const templates = createTemplateRuntime(runtime);
      const events = createEventRuntime(runtime, {
        traceSink(record) {
          if (
            record.classId === submitted.id &&
            record.phase === "completed" &&
            record.snapshot !== undefined
          ) {
            dispatchBoundaryEvent("velkren:submitted", record.snapshot);
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
      templates.register(
        createTemplateClass("solid-membrane.panel.default", {
          component: panelClass.id,
          roots: { main: panelNode() },
        }),
      );

      const panel = await components.create(panelClass.id);
      const projected = await projection.mount(
        panel,
        templates.resolvePlan(panel),
      );
      const root = projected.roots.main;
      if (root === undefined) throw new Error("panel root was not projected");
      interactions.bind(root, "click", submitted, () => ({ editor: label }));

      return {
        async dispose(): Promise<void> {
          await panel.release();
          await projected.release();
        },
      };
    },
  };
  defineSolidVelkrenElement(tag, config);
  logSubmissionsFor(tag, logList);
}

export function registerReactMembrane(logList: HTMLElement): void {
  const tag = "velkren-react-widget";
  const panelClass = createComponentClass("react-membrane.panel", () => ({}));
  const submitted = createEventClass("react-membrane.submitted", {
    editor: eventField((value) => typeof value === "string"),
  });
  const config: ReactMembraneConfig = {
    async mount({ renderer, element, dispatchBoundaryEvent }) {
      const label = element.getAttribute("label") ?? tag;
      const runtime = createRuntime({
        id: `react-membrane-${label.toLowerCase()}`,
      });
      const components = createComponentRuntime(runtime);
      const templates = createTemplateRuntime(runtime);
      const events = createEventRuntime(runtime, {
        traceSink(record) {
          if (
            record.classId === submitted.id &&
            record.phase === "completed" &&
            record.snapshot !== undefined
          ) {
            dispatchBoundaryEvent("velkren:submitted", record.snapshot);
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
      templates.register(
        createTemplateClass("react-membrane.panel.default", {
          component: panelClass.id,
          roots: { main: panelNode() },
        }),
      );

      const panel = await components.create(panelClass.id);
      const projected = await projection.mount(
        panel,
        templates.resolvePlan(panel),
      );
      const root = projected.roots.main;
      if (root === undefined) throw new Error("panel root was not projected");
      interactions.bind(root, "click", submitted, () => ({ editor: label }));

      return {
        async dispose(): Promise<void> {
          await panel.release();
          await projected.release();
        },
      };
    },
  };
  defineReactVelkrenElement(tag, config);
  logSubmissionsFor(tag, logList);
}

export function registerVueMembrane(logList: HTMLElement): void {
  const tag = "velkren-vue-widget";
  const panelClass = createComponentClass("vue-membrane.panel", () => ({}));
  const submitted = createEventClass("vue-membrane.submitted", {
    editor: eventField((value) => typeof value === "string"),
  });
  const config: VueMembraneConfig = {
    async mount({ renderer, element, dispatchBoundaryEvent }) {
      const label = element.getAttribute("label") ?? tag;
      const runtime = createRuntime({
        id: `vue-membrane-${label.toLowerCase()}`,
      });
      const components = createComponentRuntime(runtime);
      const templates = createTemplateRuntime(runtime);
      const events = createEventRuntime(runtime, {
        traceSink(record) {
          if (
            record.classId === submitted.id &&
            record.phase === "completed" &&
            record.snapshot !== undefined
          ) {
            dispatchBoundaryEvent("velkren:submitted", record.snapshot);
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
      templates.register(
        createTemplateClass("vue-membrane.panel.default", {
          component: panelClass.id,
          roots: { main: panelNode() },
        }),
      );

      const panel = await components.create(panelClass.id);
      const projected = await projection.mount(
        panel,
        templates.resolvePlan(panel),
      );
      const root = projected.roots.main;
      if (root === undefined) throw new Error("panel root was not projected");
      interactions.bind(root, "click", submitted, () => ({ editor: label }));

      return {
        async dispose(): Promise<void> {
          await panel.release();
          await projected.release();
        },
      };
    },
  };
  defineVueVelkrenElement(tag, config);
  logSubmissionsFor(tag, logList);
}
