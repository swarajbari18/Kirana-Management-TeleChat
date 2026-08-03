import { describe, expect, it } from "vitest";
import { buildMspFactRecords } from "./msp-fact-registry.js";

describe("buildMspFactRecords", () => {
  const verifiedFacts = {
    shopName: "Bantu Kirana",
    ownerName: "Swaraj Bari",
    gstRegistered: true,
    gstin: "27AAPFU0939F1ZV",
    instructions: [""],
  };

  it("emits 5 citeable facts for read_shop_profile", () => {
    const records = buildMspFactRecords(
      "fetch_shop_profile",
      "my_shop_profile",
      "read_shop_profile",
      verifiedFacts,
    );
    expect(records).toHaveLength(5);
    expect(records.map((r) => r.field).sort()).toEqual(
      ["gstRegistered", "gstin", "instructions", "ownerName", "shopName"].sort(),
    );
  });

  it("assigns stable factId pattern", () => {
    const records = buildMspFactRecords(
      "fetch_shop_profile",
      "my_shop_profile",
      "read_shop_profile",
      verifiedFacts,
    );
    const shopName = records.find((r) => r.field === "shopName");
    expect(shopName?.factId).toBe(
      "my_shop_profile_fetch_shop_profile_read_shop_profile_shopName",
    );
    expect(shopName?.catalogLabel).toContain("Bantu Kirana");
  });

  it("sets boolean valueType for gstRegistered", () => {
    const records = buildMspFactRecords(
      "fetch_shop_profile",
      "my_shop_profile",
      "read_shop_profile",
      verifiedFacts,
    );
    const gst = records.find((r) => r.field === "gstRegistered");
    expect(gst?.valueType).toBe("boolean");
    expect(gst?.value).toBe("true");
  });
});
