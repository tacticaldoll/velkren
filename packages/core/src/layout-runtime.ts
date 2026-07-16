import { ManagedStatus } from "./managed-lifecycle.js";
import type { RootHandle } from "./renderer-port.js";
import type { Runtime } from "./runtime.js";

/** The ordered, synchronous phases of a layout pass. */
export const LayoutPhase = {
  Measure: "measure",
  Calculate: "calculate",
  Apply: "apply",
} as const;
export type LayoutPhase = (typeof LayoutPhase)[keyof typeof LayoutPhase];

const PHASE_ORDER: readonly LayoutPhase[] = [
  LayoutPhase.Measure,
  LayoutPhase.Calculate,
  LayoutPhase.Apply,
];

/** The per-handle context handed to each synchronous layout phase hook. */
export interface LayoutPhaseContext {
  readonly handle: RootHandle;
  readonly phase: LayoutPhase;
  readonly scratch: Record<string, unknown>;
}

/** A synchronous layout phase hook. It MUST NOT return a promise or thenable. */
export type LayoutPhaseHook = (context: LayoutPhaseContext) => void;

/** A handle-scoped, synchronous layout contract. */
export interface LayoutContract {
  readonly measure: LayoutPhaseHook;
  readonly calculate: LayoutPhaseHook;
  readonly apply: LayoutPhaseHook;
}

/** The layout coordinator composed onto one Runtime. */
export interface LayoutRuntime {
  readonly runtime: Runtime;
  register(handle: RootHandle, contract: LayoutContract): void;
  invalidate(handle: RootHandle): void;
  flush(): void;
}

export class DuplicateLayoutRuntimeError extends Error {
  constructor() {
    super("Runtime already has a layout coordinator.");
    this.name = "DuplicateLayoutRuntimeError";
  }
}

export class LayoutRegistrationError extends Error {
  constructor(readonly reason: string) {
    super(`Layout registration rejected: ${reason}.`);
    this.name = "LayoutRegistrationError";
  }
}

export class LayoutPhaseError extends Error {
  constructor(
    readonly phase: LayoutPhase,
    readonly rootName: string,
  ) {
    super(
      `Layout ${phase} hook for root ${JSON.stringify(rootName)} must run synchronously.`,
    );
    this.name = "LayoutPhaseError";
  }
}

interface LayoutBinding {
  readonly contract: LayoutContract;
  readonly order: number;
}

const layoutRuntimes = new WeakMap<Runtime, LayoutRuntime>();

/** Create the single layout coordinator for a Runtime. */
export function createLayoutRuntime(runtime: Runtime): LayoutRuntime {
  if (layoutRuntimes.has(runtime)) {
    throw new DuplicateLayoutRuntimeError();
  }
  const domain = new DefaultLayoutRuntime(runtime);
  layoutRuntimes.set(runtime, domain);
  return domain;
}

class DefaultLayoutRuntime implements LayoutRuntime {
  readonly #bindings = new Map<RootHandle, LayoutBinding>();
  readonly #dirty = new Set<RootHandle>();
  #nextOrder = 0;

  constructor(readonly runtime: Runtime) {}

  register(handle: RootHandle, contract: LayoutContract): void {
    this.#assertHandle(handle);
    handle.assertActive("register a layout contract");
    assertContract(contract);
    if (this.#bindings.has(handle)) {
      throw new LayoutRegistrationError("handle already has a layout contract");
    }
    this.#bindings.set(handle, { contract, order: this.#nextOrder++ });
  }

  invalidate(handle: RootHandle): void {
    this.#assertHandle(handle);
    if (!this.#bindings.has(handle)) {
      throw new LayoutRegistrationError("handle has no active layout contract");
    }
    handle.assertActive("invalidate a layout");
    this.#dirty.add(handle);
  }

  flush(): void {
    this.#pruneReleased();
    const ordered = [...this.#bindings.entries()]
      .filter(([handle]) => this.#dirty.has(handle))
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([handle, binding]) => ({ handle, binding }));

    const scratches = new Map<RootHandle, Record<string, unknown>>();
    for (const { handle } of ordered) scratches.set(handle, {});

    for (const phase of PHASE_ORDER) {
      for (const { handle, binding } of ordered) {
        const context: LayoutPhaseContext = {
          handle,
          phase,
          scratch: scratches.get(handle) as Record<string, unknown>,
        };
        const result = binding.contract[phase](context);
        if (isThenable(result)) {
          throw new LayoutPhaseError(phase, handle.rootName);
        }
      }
    }

    for (const { handle } of ordered) this.#dirty.delete(handle);
  }

  #pruneReleased(): void {
    for (const handle of this.#bindings.keys()) {
      if (handle.status !== ManagedStatus.Active) {
        this.#bindings.delete(handle);
        this.#dirty.delete(handle);
      }
    }
  }

  #assertHandle(handle: RootHandle): void {
    this.runtime.assertOwns(handle);
    if (
      typeof handle !== "object" ||
      handle === null ||
      typeof handle.rootName !== "string" ||
      typeof handle.assertActive !== "function"
    ) {
      throw new LayoutRegistrationError("value is not a RootHandle");
    }
  }
}

function assertContract(contract: LayoutContract): void {
  if (typeof contract !== "object" || contract === null) {
    throw new LayoutRegistrationError("contract is not an object");
  }
  for (const phase of PHASE_ORDER) {
    if (typeof contract[phase] !== "function") {
      throw new LayoutRegistrationError(`contract is missing a ${phase} hook`);
    }
  }
}

function isThenable(value: unknown): boolean {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
