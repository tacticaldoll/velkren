import { createRuntimeId, type RuntimeId } from "./identity.js";
import { OwnershipError } from "./runtime-errors.js";

const runtimeOwnedBrand: unique symbol = Symbol("velkren.runtime-owned");
const ownership = new WeakMap<object, RuntimeOwnership>();
let generatedRuntimeSequence = 0;

interface RuntimeOwnership {
  readonly runtimeId: RuntimeId;
  readonly token: object;
}

type RuntimeState = RuntimeOwnership;

const runtimeState = new WeakMap<Runtime, RuntimeState>();

export interface RuntimeOwned {
  readonly [runtimeOwnedBrand]: true;
}

export interface RuntimeOptions {
  readonly id?: string;
}

export class Runtime {
  readonly id: RuntimeId;

  private constructor(id: RuntimeId, state: RuntimeState) {
    this.id = id;
    runtimeState.set(this, state);
  }

  owns(value: object): value is RuntimeOwned {
    return ownership.get(value)?.token === getRuntimeState(this).token;
  }

  assertOwns(value: object): asserts value is RuntimeOwned {
    const expected = getRuntimeState(this);
    const actual = ownership.get(value);
    if (actual?.token !== expected.token) {
      throw new OwnershipError(expected.runtimeId, actual?.runtimeId);
    }
  }

  static create(options: RuntimeOptions = {}): Runtime {
    const id = createRuntimeId(options.id ?? nextGeneratedRuntimeId());
    const state: RuntimeState = {
      runtimeId: id,
      token: Object.freeze({}),
    };
    return new Runtime(id, state);
  }
}

export function createRuntime(options: RuntimeOptions = {}): Runtime {
  return Runtime.create(options);
}

function nextGeneratedRuntimeId(): string {
  generatedRuntimeSequence += 1;
  return `runtime-${generatedRuntimeSequence}`;
}

function getRuntimeState(runtime: Runtime): RuntimeState {
  const state = runtimeState.get(runtime);
  if (state === undefined) {
    throw new TypeError("Runtime was not created by Velkren.");
  }
  return state;
}

export function markRuntimeOwned<T extends object>(
  runtime: Runtime,
  value: T,
): T & RuntimeOwned {
  const state = getRuntimeState(runtime);
  Object.defineProperty(value, runtimeOwnedBrand, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  ownership.set(value, state);
  return value as T & RuntimeOwned;
}
