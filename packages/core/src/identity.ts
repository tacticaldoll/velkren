const RUNTIME_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const CLASS_KIND_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const LOCAL_CLASS_SLUG_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/;
const INSTANCE_LOCAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

declare const runtimeIdBrand: unique symbol;
declare const classKindBrand: unique symbol;
declare const localClassSlugBrand: unique symbol;
declare const canonicalClassIdBrand: unique symbol;
declare const qualifiedRegistrationIdBrand: unique symbol;
declare const managedInstanceIdBrand: unique symbol;

export type RuntimeId = string & { readonly [runtimeIdBrand]: true };
export type ClassKind = string & { readonly [classKindBrand]: true };
export type LocalClassSlug = string & { readonly [localClassSlugBrand]: true };
export type CanonicalClassId = string & {
  readonly [canonicalClassIdBrand]: true;
};
export type QualifiedRegistrationId = string & {
  readonly [qualifiedRegistrationIdBrand]: true;
};
export type ManagedInstanceId = string & {
  readonly [managedInstanceIdBrand]: true;
};

export class IdentityValidationError extends TypeError {
  readonly field: string;
  readonly value: string;

  constructor(field: string, value: string, expected: string) {
    super(`Invalid ${field} ${JSON.stringify(value)}; expected ${expected}.`);
    this.name = "IdentityValidationError";
    this.field = field;
    this.value = value;
  }
}

function validate(
  field: string,
  value: string,
  pattern: RegExp,
  expected: string,
): void {
  if (!pattern.test(value)) {
    throw new IdentityValidationError(field, value, expected);
  }
}

export function createRuntimeId(value: string): RuntimeId {
  validate(
    "runtime ID",
    value,
    RUNTIME_ID_PATTERN,
    "a lowercase dot-or-hyphen-separated identifier",
  );
  return value as RuntimeId;
}

export function createClassKind(value: string): ClassKind {
  validate(
    "class kind",
    value,
    CLASS_KIND_PATTERN,
    "a lowercase hyphen-separated identifier",
  );
  return value as ClassKind;
}

export function createLocalClassSlug(value: string): LocalClassSlug {
  validate(
    "local class slug",
    value,
    LOCAL_CLASS_SLUG_PATTERN,
    "a lowercase dot-separated identifier without a class-kind prefix",
  );
  return value as LocalClassSlug;
}

export function createCanonicalClassId(
  kind: string | ClassKind,
  slug: string | LocalClassSlug,
): CanonicalClassId {
  const validKind = createClassKind(kind);
  const validSlug = createLocalClassSlug(slug);
  return `${validKind}/${validSlug}` as CanonicalClassId;
}

export function createQualifiedRegistrationId(
  runtimeId: string | RuntimeId,
  classId: CanonicalClassId,
): QualifiedRegistrationId {
  const validRuntimeId = createRuntimeId(runtimeId);
  return `${validRuntimeId}::${classId}` as QualifiedRegistrationId;
}

export function createManagedInstanceId(
  runtimeId: string | RuntimeId,
  kind: string | ClassKind,
  localId: string,
): ManagedInstanceId {
  const validRuntimeId = createRuntimeId(runtimeId);
  const validKind = createClassKind(kind);
  validate(
    "managed instance local ID",
    localId,
    INSTANCE_LOCAL_ID_PATTERN,
    "a lowercase hyphen-separated identifier",
  );
  return `${validRuntimeId}::${validKind}-instance/${localId}` as ManagedInstanceId;
}
