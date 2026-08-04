import { describe, expect, it } from "vitest";
import { buildUserProfileFactRecords } from "./user-profile-fact-registry.js";

describe("buildUserProfileFactRecords", () => {
  const verifiedFacts = {
    shopName: "Bantu Kirana",
    ownerName: "Swaraj Bari",
    gstRegistered: true,
    gstin: "27AAPFU0939F1ZV",
    instructions: [""],
  };

  it("emits 5 citeable facts for read_shop_profile", () => {
    const records = buildUserProfileFactRecords(
      "fetch_shop_profile",
      "user_profile",
      "read_shop_profile",
      verifiedFacts,
    );
    expect(records).toHaveLength(5);
    expect(records.map((r) => r.field).sort()).toEqual(
      ["gstRegistered", "gstin", "instructions", "ownerName", "shopName"].sort(),
    );
  });

  it("assigns stable factId pattern with user_profile prefix", () => {
    const records = buildUserProfileFactRecords(
      "fetch_shop_profile",
      "user_profile",
      "read_shop_profile",
      verifiedFacts,
    );
    const shopName = records.find((r) => r.field === "shopName");
    expect(shopName?.factId).toBe(
      "user_profile_fetch_shop_profile_read_shop_profile_shopName",
    );
    expect(shopName?.catalogLabel).toContain("Bantu Kirana");
  });

  it("sets boolean valueType for gstRegistered", () => {
    const records = buildUserProfileFactRecords(
      "fetch_shop_profile",
      "user_profile",
      "read_shop_profile",
      verifiedFacts,
    );
    const gst = records.find((r) => r.field === "gstRegistered");
    expect(gst?.valueType).toBe("boolean");
    expect(gst?.value).toBe("true");
  });
});
