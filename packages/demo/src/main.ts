import { createReactRenderer } from "@velkren/react-adapter";
import { createSolidRenderer } from "@velkren/solid-adapter";
import { createVueRenderer } from "@velkren/vue-adapter";

import {
  mountReactNestedViews,
  mountSolidNestedViews,
  mountVueNestedViews,
} from "./scenarios/nested-views.js";
import { mountKeyedListScenario } from "./scenarios/keyed-list.js";
import {
  registerReactMembrane,
  registerSolidMembrane,
  registerVueMembrane,
} from "./scenarios/membrane.js";
import { mountTwoEditorScenario } from "./scenarios/two-editor.js";

function required(value: HTMLElement | null, id: string): HTMLElement {
  if (value === null) throw new Error(`demo page is missing #${id}`);
  return value;
}

function newColumn(section: HTMLElement, label: string): HTMLElement {
  const column = document.createElement("div");
  column.className = "column";
  const heading = document.createElement("h3");
  heading.textContent = label;
  column.appendChild(heading);
  section.appendChild(column);
  return column;
}

const logList = required(document.getElementById("log-list"), "log-list");

// Section 1: the same renderer-neutral two-editor composition on all three
// adapters.
const twoEditorSection = required(
  document.getElementById("two-editor-app"),
  "two-editor-app",
);
mountTwoEditorScenario(
  "Solid",
  (container) => createSolidRenderer({ container }),
  newColumn(twoEditorSection, "Solid"),
  logList,
);
mountTwoEditorScenario(
  "React",
  (container) => createReactRenderer({ container }),
  newColumn(twoEditorSection, "React"),
  logList,
);
mountTwoEditorScenario(
  "Vue",
  (container) => createVueRenderer({ container }),
  newColumn(twoEditorSection, "Vue"),
  logList,
);

// Section 2: native nested views (a registered "Dialog" view hosting a
// managed child via `mountChild`). Each framework's anchor-registration
// mechanism differs, so each gets its own mount function.
const nestedViewsSection = required(
  document.getElementById("nested-views-app"),
  "nested-views-app",
);
mountSolidNestedViews(newColumn(nestedViewsSection, "Solid"), logList);
mountReactNestedViews(newColumn(nestedViewsSection, "React"), logList);
mountVueNestedViews(newColumn(nestedViewsSection, "Vue"), logList);

// Section 3: keyed list reordering. Reconciliation is identical across
// adapters, so one function covers all three.
const keyedListSection = required(
  document.getElementById("keyed-list-app"),
  "keyed-list-app",
);
mountKeyedListScenario(
  "Solid",
  (container) => createSolidRenderer({ container }),
  newColumn(keyedListSection, "Solid"),
  logList,
);
mountKeyedListScenario(
  "React",
  (container) => createReactRenderer({ container }),
  newColumn(keyedListSection, "React"),
  logList,
);
mountKeyedListScenario(
  "Vue",
  (container) => createVueRenderer({ container }),
  newColumn(keyedListSection, "Vue"),
  logList,
);

// Section 4: membrane embedding. Registration only -- the three custom
// elements themselves are placed as plain static markup in index.html, not
// mounted from here, to prove genuine declarative embedding.
registerSolidMembrane(logList);
registerReactMembrane(logList);
registerVueMembrane(logList);
