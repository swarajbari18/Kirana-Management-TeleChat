import { describe, expect, it } from "vitest";
import { verifyCapabilityPlan } from "./plan-verification.js";

describe("verifyCapabilityPlan", () => {
  it("rejects unknown capability", () => {
    const result = verifyCapabilityPlan({
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "test",
          capabilityId: "unknown_capability",
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unknown capability");
  });

  it("accepts my_shop_profile capability", () => {
    const result = verifyCapabilityPlan({
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "update shop",
          capabilityId: "my_shop_profile",
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(true);
  });
});
