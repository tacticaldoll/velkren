import {
  createComponentClass,
  createComponentRuntime,
  createEventClass,
  createEventRuntime,
  createInteractionBinding,
  createLayoutRuntime,
  createProjectionRuntime,
  createRuntime,
  createTemplateClass,
  createTemplateRuntime,
  eventField,
  type ComponentInstance,
  type EventClass,
  type InteractionBinding,
  type LayoutContract,
  type Projection,
  type Runtime,
  type Scope,
  type TemplateClass,
  type TemplateNode,
} from "@velkren/core";
import { createSolidRenderer } from "@velkren/solid-adapter";

/** The interaction type a Button reports; captured through the adapter. */
const BUTTON_INTERACTION = "click";

/** One assembled editor: a Panel with a TextField and a Button. */
export interface Editor {
  readonly id: string;
  readonly panel: ComponentInstance;
  readonly field: ComponentInstance;
  readonly button: ComponentInstance;
  readonly scope: Scope;
  readonly projection: Projection;
  readonly element: HTMLElement;
  retemplate(template: TemplateClass): Promise<void>;
  activate(): Promise<void>;
  dispose(): Promise<void>;
}

/** The two-editor validation application composing every runtime domain. */
export interface EditorApp {
  readonly runtime: Runtime;
  readonly container: HTMLElement;
  readonly submitted: EventClass;
  readonly emissions: string[];
  readonly layoutRuns: string[];
  createEditor(id: string): Promise<Editor>;
  defaultTemplate(): TemplateClass;
  altTemplate(): TemplateClass;
}

/** The minimal validation component set. Fixtures, not a public UI library. */
export const panelClass = createComponentClass("editor.panel", () => ({}));
export const fieldClass = createComponentClass("editor.field", () => ({
  value: "",
}));
export const buttonClass = createComponentClass("editor.button", () => ({}));
export const dialogClass = createComponentClass("editor.dialog", () => ({
  open: false,
}));

/** Every validation component class. */
export const editorComponentClasses = [
  panelClass,
  fieldClass,
  buttonClass,
  dialogClass,
] as const;

/** A minimal single-root template bound to one validation component. */
export function templateFor(
  component: (typeof editorComponentClasses)[number],
  version = "1",
): TemplateClass {
  return createTemplateClass(component.localSlug, {
    component: component.id,
    roots: { main: { kind: "section", attributes: { version } } },
  });
}

function panelNode(version: string): TemplateNode {
  return {
    kind: "section",
    attributes: { version },
    children: [{ kind: "input" }, { kind: "button" }],
  };
}

function panelTemplate(version: string): TemplateClass {
  return createTemplateClass("editor.panel.default", {
    component: "component/editor.panel",
    roots: { main: panelNode(version) },
  });
}

/** Build a fresh two-editor validation application. */
export function createEditorApp(): EditorApp {
  const runtime = createRuntime({ id: "validation" });
  const components = createComponentRuntime(runtime);
  const templates = createTemplateRuntime(runtime);

  const submitted = createEventClass("editor.submitted", {
    editor: eventField((value) => typeof value === "string"),
  });

  const emissions: string[] = [];
  // Observe the business event through the event domain's own trace, never a
  // DOM listener attached by this validation.
  const events = createEventRuntime(runtime, {
    traceSink(record) {
      if (record.classId === submitted.id && record.phase === "completed") {
        const editor = record.snapshot?.editor;
        if (typeof editor === "string") emissions.push(editor);
      }
    },
  });
  events.register(submitted);

  const renderer = createSolidRenderer();
  const projection = createProjectionRuntime(runtime, renderer);
  const layout = createLayoutRuntime(runtime);
  const interactions: InteractionBinding = createInteractionBinding(
    runtime,
    projection,
    events,
  );

  for (const componentClass of editorComponentClasses) {
    components.register(componentClass);
  }
  templates.register(panelTemplate("1"));

  const layoutRuns: string[] = [];

  const stackContract = (id: string): LayoutContract => ({
    measure(ctx) {
      ctx.scratch.measured = true;
    },
    calculate(ctx) {
      ctx.scratch.calculated = ctx.scratch.measured === true;
    },
    apply(ctx) {
      if (ctx.scratch.calculated === true) layoutRuns.push(id);
    },
  });

  async function createEditor(id: string): Promise<Editor> {
    const panel = await components.create(panelClass.id);
    const field = await components.create(fieldClass.id);
    const button = await components.create(buttonClass.id);
    components.attach(panel, field);
    components.attach(panel, button);

    const scope = components.createScope({
      field: components.reference(field),
      button: components.reference(button),
    });

    const projected = await projection.mount(
      panel,
      templates.resolvePlan(panel),
    );
    const root = projected.roots.main;
    if (root === undefined) throw new Error("panel root was not projected");

    const element = renderer.elementForIdentity(root.identity);
    if (element === undefined)
      throw new Error("projected root element missing");

    // Route the Button interaction through the neutral port and binding: no
    // data-velkren-root selector, no application-attached native listener.
    interactions.bind(root, BUTTON_INTERACTION, submitted, () => ({
      editor: id,
    }));

    layout.register(root, stackContract(id));
    layout.invalidate(root);
    layout.flush();

    let disposed = false;
    return {
      id,
      panel,
      field,
      button,
      scope,
      projection: projected,
      element,
      async retemplate(template: TemplateClass) {
        await templates.replace(template);
        const plan = templates.resolvePlan(panel);
        const next = plan.roots.main;
        // Commit to the same root; the interaction binding survives untouched.
        if (next !== undefined) projection.commit(root, next);
      },
      async activate() {
        renderer.simulateInteraction(root.identity, BUTTON_INTERACTION);
        await interactions.settled();
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        await panel.release();
        await projected.release();
        layout.flush();
      },
    };
  }

  return {
    runtime,
    container: renderer.container,
    submitted,
    emissions,
    layoutRuns,
    defaultTemplate: () => panelTemplate("1"),
    altTemplate: () => panelTemplate("2"),
    createEditor,
  };
}
