import {
  createComponentClass,
  createComponentRuntime,
  createEventClass,
  createEventRuntime,
  createLayoutRuntime,
  createProjectionRuntime,
  createRuntime,
  createTemplateClass,
  createTemplateRuntime,
  eventField,
  PROJECTION_IDENTITY_ATTRIBUTE,
  type ComponentInstance,
  type EventClass,
  type LayoutContract,
  type Projection,
  type Runtime,
  type Scope,
  type TemplateClass,
  type TemplateNode,
} from "@velkren/core";
import {
  createSolidRenderer,
  snapshotNativeEvent,
} from "@velkren/solid-adapter";

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
  activate(): void;
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
  const events = createEventRuntime(runtime);
  const renderer = createSolidRenderer();
  const projection = createProjectionRuntime(runtime, renderer);
  const layout = createLayoutRuntime(runtime);

  for (const componentClass of editorComponentClasses) {
    components.register(componentClass);
  }

  const submitted = createEventClass("editor.submitted", {
    editor: eventField((value) => typeof value === "string"),
  });
  events.register(submitted);
  templates.register(panelTemplate("1"));

  const emissions: string[] = [];
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

    const element = renderer.container.querySelector<HTMLElement>(
      `[${PROJECTION_IDENTITY_ATTRIBUTE}="${root.identity}"]`,
    );
    if (element === null) throw new Error("projected root element not found");

    const listener: EventListener = (event) => {
      // Snapshot at the boundary; dispatch a runtime semantic event.
      snapshotNativeEvent(event);
      emissions.push(id);
      void events.dispatch(submitted.id, { editor: id });
    };
    element.addEventListener("click", listener);

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
        if (next !== undefined) projection.commit(root, next);
      },
      activate() {
        element.dispatchEvent(new Event("click"));
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        element.removeEventListener("click", listener);
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
