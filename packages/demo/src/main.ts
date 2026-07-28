import {
  createEditorApp,
  type EditorApp,
} from "@velkren/neutral-composition-fixture";
import { createReactRenderer } from "@velkren/react-adapter";
import { createSolidRenderer } from "@velkren/solid-adapter";
import { createVueRenderer } from "@velkren/vue-adapter";

function required(value: HTMLElement | null, id: string): HTMLElement {
  if (value === null) throw new Error(`demo page is missing #${id}`);
  return value;
}

const appColumn = required(document.getElementById("app"), "app");
const logList = required(document.getElementById("log-list"), "log-list");

/**
 * Mount one adapter's column: a label, then the SAME renderer-neutral
 * two-editor composition (`createEditorApp`, from `@velkren/neutral-
 * composition-fixture`) every adapter's own test suite already exercises.
 * No test-only affordance is used here -- clicking the rendered <button>
 * reaches the interaction binding through the adapter's own real DOM
 * listener, exactly as it would for any user of a Velkren app.
 */
function mountDemo(
  label: string,
  makeRenderer: (
    container: HTMLElement,
  ) => Parameters<typeof createEditorApp>[0],
): EditorApp {
  const column = document.createElement("div");
  column.className = "column";
  const heading = document.createElement("h2");
  heading.textContent = label;
  column.appendChild(heading);
  const mount = document.createElement("div");
  mount.className = "editor";
  column.appendChild(mount);
  appColumn.appendChild(column);

  const renderer = makeRenderer(mount);
  const app = createEditorApp(renderer);
  const reportFailure = (error: unknown): void => {
    const message = document.createElement("p");
    message.textContent = `${label}: failed to mount an editor (${String(error)})`;
    column.appendChild(message);
  };
  app.createEditor("one").catch(reportFailure);
  app.createEditor("two").catch(reportFailure);
  return app;
}

const apps: { label: string; app: EditorApp; seen: number }[] = [
  {
    label: "Solid",
    app: mountDemo("Solid", (container) => createSolidRenderer({ container })),
    seen: 0,
  },
  {
    label: "React",
    app: mountDemo("React", (container) => createReactRenderer({ container })),
    seen: 0,
  },
  {
    label: "Vue",
    app: mountDemo("Vue", (container) => createVueRenderer({ container })),
    seen: 0,
  },
];

// The activity log has no push-based hook to subscribe to -- each app's
// `emissions` array only grows as its own event trace observes a completed
// `editor.submitted` event, asynchronously after a real click. Polling is
// the simplest honest way to reflect that on the page.
function pollEmissions(): void {
  for (const entry of apps) {
    const { app, label } = entry;
    while (entry.seen < app.emissions.length) {
      const editorId = app.emissions[entry.seen];
      entry.seen += 1;
      const item = document.createElement("li");
      item.textContent = `[${label}] editor "${editorId}" submitted`;
      logList.prepend(item);
    }
  }
  requestAnimationFrame(pollEmissions);
}
requestAnimationFrame(pollEmissions);
