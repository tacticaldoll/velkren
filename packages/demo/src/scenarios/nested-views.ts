import { createElement, useContext } from "react";
import { h, inject } from "vue";

import type { AdapterRoot } from "@velkren/core";
import {
  createReactRenderer,
  RegisterAnchorContext,
  type ReactView,
} from "@velkren/react-adapter";
import { createSolidRenderer, type SolidView } from "@velkren/solid-adapter";
import {
  createVueRenderer,
  REGISTER_ANCHOR_KEY,
  type VueView,
} from "@velkren/vue-adapter";

import { appendLog } from "../log.js";

/**
 * Build the "Mount child" / "Unmount child" controls shared by every
 * framework's nested-views scenario. `mountChild`/`removeRoot` are called
 * directly on the low-level renderer -- the same operations each adapter's
 * own "native nested views" test suite already proves, exercised here on a
 * real page instead of a Vitest/happy-dom environment.
 */
function addNestingControls(
  label: string,
  column: HTMLElement,
  logList: HTMLElement,
  mountChildNode: (identity: string) => AdapterRoot,
  removeRoot: (root: AdapterRoot) => void,
  registerChildInteraction: (root: AdapterRoot) => void,
): void {
  const controls = document.createElement("div");
  const mountButton = document.createElement("button");
  mountButton.textContent = "Mount child";
  const unmountButton = document.createElement("button");
  unmountButton.textContent = "Unmount child";
  unmountButton.disabled = true;
  controls.append(mountButton, unmountButton);
  column.appendChild(controls);

  let childRoot: AdapterRoot;
  mountButton.addEventListener("click", () => {
    if (childRoot !== undefined) return;
    childRoot = mountChildNode("child-1");
    registerChildInteraction(childRoot);
    mountButton.disabled = true;
    unmountButton.disabled = false;
    appendLog(logList, `[${label} nested-views] child mounted`);
  });
  unmountButton.addEventListener("click", () => {
    if (childRoot === undefined) return;
    removeRoot(childRoot);
    childRoot = undefined;
    mountButton.disabled = false;
    unmountButton.disabled = true;
    appendLog(logList, `[${label} nested-views] child unmounted`);
  });
}

export function mountSolidNestedViews(
  column: HTMLElement,
  logList: HTMLElement,
): void {
  const dialog: SolidView = (_props, context) => {
    const el = document.createElement("dialog");
    el.open = true;
    const chrome = document.createElement("p");
    chrome.textContent = "Dialog chrome — click me";
    el.appendChild(chrome);
    const body = document.createElement("div");
    body.setAttribute("data-role", "body");
    context.registerAnchor("body", body);
    el.appendChild(body);
    return el;
  };
  const childContent: SolidView = (props) => {
    const el = document.createElement("p");
    el.textContent = typeof props.message === "string" ? props.message : "";
    return el;
  };

  const mount = document.createElement("div");
  mount.className = "editor";
  column.appendChild(mount);

  const renderer = createSolidRenderer({
    container: mount,
    views: { dialog, child: childContent },
  });
  const parentRoot = renderer.createRoot("solid-dialog-1", {
    node: "view",
    viewId: "dialog",
    props: {},
  });
  renderer.registerInteraction(parentRoot, "click", () => {
    appendLog(logList, "[Solid nested-views] dialog chrome clicked");
  });

  addNestingControls(
    "Solid",
    column,
    logList,
    (identity) =>
      renderer.mountChild(parentRoot, "body", identity, {
        node: "view",
        viewId: "child",
        props: { message: "I'm a managed child, mounted via mountChild." },
      }),
    (root) => renderer.removeRoot(root),
    (root) =>
      renderer.registerInteraction(root, "click", () => {
        appendLog(logList, "[Solid nested-views] child clicked (isolated)");
      }),
  );
}

export function mountReactNestedViews(
  column: HTMLElement,
  logList: HTMLElement,
): void {
  const Dialog: ReactView = () => {
    const registerAnchor = useContext(RegisterAnchorContext);
    return createElement("dialog", { open: true }, [
      createElement("p", { key: "chrome" }, "Dialog chrome — click me"),
      createElement("div", {
        key: "body",
        "data-role": "body",
        ref: (element: HTMLDivElement | null) => {
          if (element !== null) registerAnchor?.("body", element);
        },
      }),
    ]);
  };
  const ChildContent: ReactView = (props) =>
    createElement(
      "p",
      null,
      typeof props.message === "string" ? props.message : "",
    );

  const mount = document.createElement("div");
  mount.className = "editor";
  column.appendChild(mount);

  const renderer = createReactRenderer({
    container: mount,
    views: { dialog: Dialog, child: ChildContent },
  });
  const parentRoot = renderer.createRoot("react-dialog-1", {
    node: "view",
    viewId: "dialog",
    props: {},
  });
  renderer.registerInteraction(parentRoot, "click", () => {
    appendLog(logList, "[React nested-views] dialog chrome clicked");
  });

  addNestingControls(
    "React",
    column,
    logList,
    (identity) =>
      renderer.mountChild(parentRoot, "body", identity, {
        node: "view",
        viewId: "child",
        props: { message: "I'm a managed child, mounted via mountChild." },
      }),
    (root) => renderer.removeRoot(root),
    (root) =>
      renderer.registerInteraction(root, "click", () => {
        appendLog(logList, "[React nested-views] child clicked (isolated)");
      }),
  );
}

export function mountVueNestedViews(
  column: HTMLElement,
  logList: HTMLElement,
): void {
  const Dialog: VueView = () => {
    const registerAnchor = inject(REGISTER_ANCHOR_KEY);
    return h("dialog", null, [
      h("p", null, "Dialog chrome — click me"),
      h("div", {
        "data-role": "body",
        ref: (element: Element | null) => {
          if (element instanceof HTMLElement) {
            registerAnchor?.("body", element);
          }
        },
      } as Record<string, unknown>),
    ]);
  };
  const ChildContent: VueView = (props) =>
    h("p", null, typeof props.message === "string" ? props.message : "");

  const mount = document.createElement("div");
  mount.className = "editor";
  column.appendChild(mount);

  const renderer = createVueRenderer({
    container: mount,
    views: { dialog: Dialog, child: ChildContent },
  });
  const parentRoot = renderer.createRoot("vue-dialog-1", {
    node: "view",
    viewId: "dialog",
    props: {},
  });
  renderer.registerInteraction(parentRoot, "click", () => {
    appendLog(logList, "[Vue nested-views] dialog chrome clicked");
  });

  addNestingControls(
    "Vue",
    column,
    logList,
    (identity) =>
      renderer.mountChild(parentRoot, "body", identity, {
        node: "view",
        viewId: "child",
        props: { message: "I'm a managed child, mounted via mountChild." },
      }),
    (root) => renderer.removeRoot(root),
    (root) =>
      renderer.registerInteraction(root, "click", () => {
        appendLog(logList, "[Vue nested-views] child clicked (isolated)");
      }),
  );
}
