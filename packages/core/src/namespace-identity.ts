import {
  createClassKind,
  createLocalClassSlug,
  createRuntimeId,
  type ClassKind,
  type LocalClassSlug,
  type RuntimeId,
} from "./identity.js";

const ROOT_NAMESPACE_VALUE = "@root";

declare const loaderNamespaceBrand: unique symbol;
declare const qualifiedLoaderIdBrand: unique symbol;

export type LoaderNamespace = string & {
  readonly [loaderNamespaceBrand]: true;
};

export type QualifiedLoaderId = string & {
  readonly [qualifiedLoaderIdBrand]: true;
};

export interface NamespaceCandidate {
  readonly namespace: LoaderNamespace;
}

export function createLoaderNamespace(value?: string): LoaderNamespace {
  if (value === undefined) {
    return ROOT_NAMESPACE_VALUE as LoaderNamespace;
  }
  return String(createLocalClassSlug(value)) as LoaderNamespace;
}

export function isRootNamespace(namespace: LoaderNamespace): boolean {
  return namespace === ROOT_NAMESPACE_VALUE;
}

export function createQualifiedLoaderId(
  runtimeId: string | RuntimeId,
  kind: string | ClassKind,
  namespace: LoaderNamespace,
): QualifiedLoaderId {
  const validRuntimeId = createRuntimeId(runtimeId);
  const validKind = createClassKind(kind);
  validateLoaderNamespace(namespace);
  return `${validRuntimeId}::${validKind}-loader/${namespace}` as QualifiedLoaderId;
}

export function namespaceContains(
  namespace: LoaderNamespace,
  localSlug: string | LocalClassSlug,
): boolean {
  const validSlug = createLocalClassSlug(localSlug);
  validateLoaderNamespace(namespace);
  return (
    isRootNamespace(namespace) ||
    String(validSlug) === String(namespace) ||
    validSlug.startsWith(`${namespace}.`)
  );
}

export function namespaceDepth(namespace: LoaderNamespace): number {
  validateLoaderNamespace(namespace);
  return isRootNamespace(namespace) ? 0 : namespace.split(".").length;
}

export function selectDeepestNamespace<T extends NamespaceCandidate>(
  candidates: Iterable<T>,
  localSlug: string | LocalClassSlug,
): T | undefined {
  const validSlug = createLocalClassSlug(localSlug);
  let selected: T | undefined;
  let selectedDepth = -1;

  for (const candidate of candidates) {
    if (!namespaceContains(candidate.namespace, validSlug)) {
      continue;
    }
    const depth = namespaceDepth(candidate.namespace);
    if (depth > selectedDepth) {
      selected = candidate;
      selectedDepth = depth;
    }
  }

  return selected;
}

function validateLoaderNamespace(namespace: LoaderNamespace): void {
  if (!isRootNamespace(namespace)) {
    createLocalClassSlug(namespace);
  }
}
