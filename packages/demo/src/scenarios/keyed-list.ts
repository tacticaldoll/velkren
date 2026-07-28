import type { RendererPort, RenderNode } from "@velkren/core";

import { appendLog } from "../log.js";

const INITIAL_ROWS: readonly { key: string; label: string }[] = [
  { key: "a", label: "Alice" },
  { key: "b", label: "Bob" },
  { key: "c", label: "Carol" },
];

function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i]!;
    const b = next[j]!;
    next[i] = b;
    next[j] = a;
  }
  return next;
}

/**
 * A keyed `<ul>` of rows, each holding a live `<input>`, plus a "Shuffle"
 * button that re-commits the same keys in a new order. Reconciliation is
 * identical across adapters (`RenderNode.key`, `add-keyed-node-reconcile`),
 * so one function covers all three -- unlike the nested-views scenario,
 * where each framework's anchor-registration mechanism differs.
 *
 * Shuffle re-commits each key's CURRENT value (captured from the live
 * `<input>` on every native `input` event), not its original label: Solid
 * and React both treat `input`'s `value` as controlled
 * (`add-input-value-binding`), so committing the original label unchanged
 * would silently overwrite whatever a visitor just typed.
 */
export function mountKeyedListScenario(
  label: string,
  makeRenderer: (container: HTMLElement) => RendererPort,
  column: HTMLElement,
  logList: HTMLElement,
): void {
  const mount = document.createElement("div");
  mount.className = "editor";
  column.appendChild(mount);

  const renderer = makeRenderer(mount);
  const values = new Map(INITIAL_ROWS.map((row) => [row.key, row.label]));
  let order = INITIAL_ROWS.map((row) => row.key);

  function listOf(keys: readonly string[]): RenderNode {
    return {
      kind: "ul",
      attributes: {},
      slots: {},
      children: keys.map((key) => ({
        kind: "li",
        attributes: {},
        children: [
          {
            kind: "input",
            attributes: { value: values.get(key) ?? "" },
            children: [],
            slots: {},
          },
        ],
        slots: {},
        key,
      })),
    };
  }

  const identity = `keyed-list-${label.toLowerCase()}`;
  const root = renderer.createRoot(identity, listOf(order));

  // A delegated listener: whichever row's <input> the visitor edits, its
  // current position in `order` tells us which key it belongs to.
  mount.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const row = target.closest("li");
    if (row === null) return;
    const index = Array.from(mount.querySelectorAll("li")).indexOf(row);
    const key = order[index];
    if (key !== undefined) values.set(key, target.value);
  });

  const shuffleButton = document.createElement("button");
  shuffleButton.textContent = "Shuffle";
  shuffleButton.addEventListener("click", () => {
    order = shuffle(order);
    renderer.commit(root, identity, listOf(order));
    appendLog(logList, `[${label} keyed-list] shuffled`);
  });
  column.appendChild(shuffleButton);
}
