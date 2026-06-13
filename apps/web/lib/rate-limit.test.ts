import { describe, expect, it, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimitsForTests } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it("allows requests under the limit", () => {
    expect(checkRateLimit("user-a", 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit("user-a", 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit("user-a", 3, 60_000).allowed).toBe(true);
  });

  it("blocks requests over the limit", () => {
    checkRateLimit("user-b", 2, 60_000);
    checkRateLimit("user-b", 2, 60_000);
    const third = checkRateLimit("user-b", 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    checkRateLimit("user-c", 1, 60_000);
    expect(checkRateLimit("user-c", 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit("user-d", 1, 60_000).allowed).toBe(true);
  });
});
