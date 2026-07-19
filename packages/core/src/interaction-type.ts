import {
  createCanonicalClassId,
  createLocalClassSlug,
  type CanonicalClassId,
  type LocalClassSlug,
} from "./identity.js";

/**
 * A registered, typed interaction vocabulary entry. It gives an interaction a
 * stable identity (`id` / `localSlug`) distinct from the native DOM event name
 * (`native`) an adapter listens for, so interaction types are validated and
 * normalized across adapters instead of being raw, free-form strings. Mirrors
 * `EventClass`: an immutable, portable description not owned by any runtime until
 * registered on an interaction-binding domain.
 */
export interface InteractionType {
  readonly id: CanonicalClassId;
  readonly localSlug: LocalClassSlug;
  /** The native (e.g. DOM) event name the adapter captures for this interaction. */
  readonly native: string;
}

const interactionTypes = new WeakSet<object>();

/**
 * Create an immutable, portable `InteractionType`. `slug` is its local identity
 * (a lowercase dot-separated slug); `native` is the native event name the adapter
 * captures. The definition is not owned by a runtime until registered.
 */
export function createInteractionType(
  slug: string,
  native: string,
): InteractionType {
  if (typeof native !== "string" || native.length === 0) {
    throw new TypeError(
      "InteractionType native event name must be a non-empty string.",
    );
  }
  const localSlug = createLocalClassSlug(slug);
  const definition = Object.freeze({
    id: createCanonicalClassId("interaction", localSlug),
    localSlug,
    native,
  });
  interactionTypes.add(definition);
  return definition;
}

/** Whether a value is an `InteractionType` created by `createInteractionType`. */
export function isInteractionType(value: unknown): value is InteractionType {
  return (
    typeof value === "object" && value !== null && interactionTypes.has(value)
  );
}
