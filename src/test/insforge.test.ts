import { describe, expect, it } from "vitest";
import { computeXPGain } from "@/lib/insforge";

describe("computeXPGain", () => {
  it("gives less XP at higher levels", () => {
    const lowLevelXP = computeXPGain(3, 1);
    const highLevelXP = computeXPGain(3, 10);

    expect(lowLevelXP).toBeGreaterThan(highLevelXP);
  });

  it("never gives less than 1 XP", () => {
    expect(computeXPGain(0, 99)).toBe(2);
    expect(computeXPGain(0, 999)).toBe(2);
  });
});
