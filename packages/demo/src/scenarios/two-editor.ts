import { createEditorApp } from "@velkren/neutral-composition-fixture";

import { appendLog } from "../log.js";

/**
 * The SAME renderer-neutral two-editor composition (`createEditorApp`, from
 * `@velkren/neutral-composition-fixture`) every adapter's own test suite
 * already exercises. No test-only affordance is used here -- clicking the
 * rendered <button> reaches the interaction binding through the adapter's
 * own real DOM listener, exactly as it would for any user of a Velkren app.
 */
export function mountTwoEditorScenario(
  label: string,
  makeRenderer: (
    container: HTMLElement,
  ) => Parameters<typeof createEditorApp>[0],
  column: HTMLElement,
  logList: HTMLElement,
): void {
  const mount = document.createElement("div");
  mount.className = "editor";
  column.appendChild(mount);

  const renderer = makeRenderer(mount);
  const app = createEditorApp(renderer);
  const reportFailure = (error: unknown): void => {
    const message = document.createElement("p");
    message.textContent = `${label}: failed to mount an editor (${String(error)})`;
    column.appendChild(message);
  };
  app.createEditor("one").catch(reportFailure);
  app.createEditor("two").catch(reportFailure);

  // The activity log has no push-based hook to subscribe to -- `emissions`
  // only grows as the app's own event trace observes a completed
  // `editor.submitted` event, asynchronously after a real click. Polling is
  // the simplest honest way to reflect that on the page.
  let seen = 0;
  function poll(): void {
    while (seen < app.emissions.length) {
      const editorId = app.emissions[seen];
      seen += 1;
      appendLog(logList, `[${label}] editor "${editorId}" submitted`);
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
}
