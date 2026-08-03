import { describe, expect, it } from "vitest";
import { verifyCapabilityPlan } from "./plan-verification.js";

const validPlan = {
  businessIntent: "Owner wants to see their shop profile",
  objectives: [
    {
      objectiveId: "o1",
      objectiveDescription: "Read shop profile",
      capabilityId: "my_shop_profile",
      dependencies: [],
    },
  ],
};

describe("verifyCapabilityPlan", () => {
  it("rejects unknown capability", () => {
    const result = verifyCapabilityPlan({
      businessIntent: "Update shop",
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

  it("accepts my_shop_profile capability with businessIntent", () => {
    const result = verifyCapabilityPlan(validPlan);
    expect(result.valid).toBe(true);
  });

  it("rejects missing businessIntent", () => {
    const result = verifyCapabilityPlan({
      businessIntent: "",
      objectives: validPlan.objectives,
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics?.[0]).toContain("businessIntent");
  });

  it("rejects businessIntent equal to objective when multiple objectives", () => {
    const result = verifyCapabilityPlan({
      businessIntent: "Read profile",
      objectives: [
        {
          objectiveId: "o1",
          objectiveDescription: "Read profile",
          capabilityId: "my_shop_profile",
          dependencies: [],
        },
        {
          objectiveId: "o2",
          objectiveDescription: "Update instructions",
          capabilityId: "my_shop_profile",
          dependencies: [],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});
