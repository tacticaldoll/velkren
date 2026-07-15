import { createManagedInstanceId, type CanonicalClassId } from "./identity.js";
import {
  createManagedObject,
  type ManagedObject,
} from "./managed-lifecycle.js";
import { ManagedReleaseError } from "./runtime-errors.js";
import {
  ManagedCreationError,
  MissingRegistrationError,
} from "./registration-errors.js";
import type { Runtime } from "./runtime.js";
import type { Registration, TypedRegistry } from "./typed-registry.js";

export interface FactoryInstance<Value> extends ManagedObject {
  readonly value: Value;
}

const runtimeSequences = new WeakMap<Runtime, number>();
const instanceValues = new WeakMap<ManagedObject, unknown>();

export class ManagedFactory<Value> {
  constructor(
    readonly runtime: Runtime,
    readonly registry: TypedRegistry<Value>,
  ) {}

  async create(
    source: CanonicalClassId | Registration<Value>,
  ): Promise<FactoryInstance<Value>> {
    const registration =
      typeof source === "string" ? this.registry.resolve(source) : source;
    if (registration === undefined) {
      throw new MissingRegistrationError(source as CanonicalClassId);
    }

    this.runtime.assertOwns(registration);
    registration.assertActive("create an instance");
    this.registry.retain(registration);

    let controller: ReturnType<typeof createManagedObject>;
    try {
      const nextSequence = (runtimeSequences.get(this.runtime) ?? 0) + 1;
      runtimeSequences.set(this.runtime, nextSequence);
      controller = createManagedObject(
        this.runtime,
        createManagedInstanceId(
          this.runtime.id,
          registration.definition.kind,
          `managed-${nextSequence}`,
        ),
        registration.classId,
      );
      controller.addCleanup(() => this.registry.releaseDependent(registration));
      controller.addCleanup(() => {
        instanceValues.delete(controller.object);
      });
    } catch (cause) {
      this.registry.releaseDependent(registration);
      throw cause;
    }

    let acceptsCleanups = true;
    try {
      const value = await registration.definition.create({
        instance: controller.object,
        addCleanup: (cleanup) => {
          if (!acceptsCleanups) {
            throw new Error("Definition creation has already completed.");
          }
          controller.addCleanup(cleanup);
        },
      });
      acceptsCleanups = false;
      controller.object.assertActive("finish creation");
      instanceValues.set(controller.object, value);
      Object.defineProperty(controller.object, "value", {
        enumerable: true,
        get(this: ManagedObject) {
          this.assertActive("read its created value");
          return instanceValues.get(this) as Value;
        },
      });
      return controller.object as FactoryInstance<Value>;
    } catch (cause) {
      acceptsCleanups = false;
      let cleanupFailures: readonly unknown[] = [];
      try {
        await controller.object.release();
      } catch (releaseError) {
        if (releaseError instanceof ManagedReleaseError) {
          cleanupFailures = releaseError.failures;
        } else {
          cleanupFailures = [releaseError];
        }
      }
      throw new ManagedCreationError(
        registration.classId,
        cause,
        cleanupFailures,
      );
    }
  }
}
