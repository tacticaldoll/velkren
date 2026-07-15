import { describe, expect, it } from "vitest";

import { IdentityValidationError } from "../src/index.js";
import {
  createCanonicalClassId,
  createLocalClassSlug,
  createManagedInstanceId,
  createQualifiedRegistrationId,
  createRuntimeId,
} from "../src/identity.js";

describe("runtime and class identities", () => {
  it("formats canonical and qualified identities", () => {
    const runtimeId = createRuntimeId("admin");
    const slug = createLocalClassSlug("sample.item");
    const classId = createCanonicalClassId("alpha", slug);

    expect(classId).toBe("alpha/sample.item");
    expect(createQualifiedRegistrationId(runtimeId, classId)).toBe(
      "admin::alpha/sample.item",
    );
    expect(createManagedInstanceId(runtimeId, "alpha", "item-1")).toBe(
      "admin::alpha-instance/item-1",
    );
  });

  it.each(["", "Sample.Item", "event/sample.item", "sample..item"])(
    "rejects invalid local class slug %j",
    (slug) => {
      expect(() => createLocalClassSlug(slug)).toThrow(IdentityValidationError);
    },
  );

  it.each(["", "Admin", "admin::other", "admin/"])(
    "rejects invalid runtime ID %j",
    (runtimeId) => {
      expect(() => createRuntimeId(runtimeId)).toThrow(IdentityValidationError);
    },
  );

  it.each(["", "Alpha", "alpha.kind", "alpha/kind"])(
    "rejects invalid canonical class kind %j",
    (kind) => {
      expect(() => createCanonicalClassId(kind, "sample.item")).toThrow(
        IdentityValidationError,
      );
    },
  );

  it.each(["", "Item-1", "item.1", "item/1"])(
    "rejects invalid managed instance local ID %j",
    (localId) => {
      expect(() => createManagedInstanceId("admin", "alpha", localId)).toThrow(
        IdentityValidationError,
      );
    },
  );
});
