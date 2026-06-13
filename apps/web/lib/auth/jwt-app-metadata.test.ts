import { describe, expect, it, beforeEach } from "vitest";
import { jwtAppMetadataFlag } from "./jwt-app-metadata";

describe("jwtAppMetadataFlag", () => {
  it("returns true when flag is true", () => {
    expect(jwtAppMetadataFlag({ is_disabled: true }, "is_disabled")).toBe(true);
  });

  it("returns false when flag is false", () => {
    expect(jwtAppMetadataFlag({ is_platform_staff: false }, "is_platform_staff")).toBe(false);
  });

  it("returns undefined when flag is absent", () => {
    expect(jwtAppMetadataFlag({}, "is_disabled")).toBeUndefined();
    expect(jwtAppMetadataFlag(null, "is_disabled")).toBeUndefined();
  });
});
