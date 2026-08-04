import { describe, expect, it } from "vitest";
import { verifyBindings } from "./binding-verifier.js";
import {
  buildInventoryFixtureRecords,
  buildUserProfileFactRecords,
} from "../verified-facts/user-profile-fact-registry.js";
import type { GroundedResponse } from "../grounded-response/types.js";
import type { OutcomeRecord } from "../verified-facts/types.js";

function userProfileRegistry() {
  const records = buildUserProfileFactRecords(
    "fetch_shop_profile",
    "user_profile",
    "read_shop_profile",
    {
      shopName: "Bantu Kirana",
      ownerName: "Swaraj Bari",
      gstRegistered: true,
      gstin: "27AAPFU0939F1ZV",
      instructions: [""],
    },
  );
  return new Map(records.map((r) => [r.factId, r]));
}

function invRegistry() {
  return new Map(
    buildInventoryFixtureRecords().map((r) => [r.factId, r]),
  );
}

describe("verifyBindings BV catalog", () => {
  const emptyOutcomes = new Map<string, OutcomeRecord>();

  it("BV-01 valid MSP shopName binding", () => {
    const registry = userProfileRegistry();
    const shopFact = [...registry.values()].find((r) => r.field === "shopName")!;
    const response: GroundedResponse = {
      lines: [
        {
          display: "Shop name: Bantu Kirana",
          bindings: [
            {
              factId: shopFact.factId,
              field: "shopName",
              asShown: "Bantu Kirana",
            },
          ],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)).toHaveLength(0);
  });

  it("BV-02 valid gstin binding", () => {
    const registry = userProfileRegistry();
    const gstin = [...registry.values()].find((r) => r.field === "gstin")!;
    const response: GroundedResponse = {
      lines: [
        {
          display: "GSTIN: 27AAPFU0939F1ZV",
          bindings: [
            {
              factId: gstin.factId,
              field: "gstin",
              asShown: "27AAPFU0939F1ZV",
            },
          ],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)).toHaveLength(0);
  });

  it("BV-03 gstRegistered Yes vs true", () => {
    const registry = userProfileRegistry();
    const gstReg = [...registry.values()].find((r) => r.field === "gstRegistered")!;
    const response: GroundedResponse = {
      lines: [
        {
          display: "GST Registered: Yes",
          bindings: [
            {
              factId: gstReg.factId,
              field: "gstRegistered",
              asShown: "Yes",
            },
          ],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)).toHaveLength(0);
  });

  it("BV-04 value_mismatch", () => {
    const registry = userProfileRegistry();
    const shopFact = [...registry.values()].find((r) => r.field === "shopName")!;
    const response: GroundedResponse = {
      lines: [
        {
          display: "Shop name: Other Shop",
          bindings: [
            {
              factId: shopFact.factId,
              field: "shopName",
              asShown: "Other Shop",
            },
          ],
        },
      ],
    };
    const failures = verifyBindings(response, registry, emptyOutcomes);
    expect(failures[0]?.reason).toBe("value_mismatch");
  });

  it("BV-05 unknown_factId", () => {
    const registry = userProfileRegistry();
    const response: GroundedResponse = {
      lines: [
        {
          display: "Shop: X",
          bindings: [{ factId: "unknown", field: "shopName", asShown: "X" }],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)[0]?.reason).toBe(
      "unknown_factId",
    );
  });

  it("BV-06 field_mismatch", () => {
    const registry = userProfileRegistry();
    const shopFact = [...registry.values()].find((r) => r.field === "shopName")!;
    const response: GroundedResponse = {
      lines: [
        {
          display: "Name: Bantu Kirana",
          bindings: [
            {
              factId: shopFact.factId,
              field: "name",
              asShown: "Bantu Kirana",
            },
          ],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)[0]?.reason).toBe(
      "field_mismatch",
    );
  });

  it("BV-07 unbound_factual_line with GSTIN", () => {
    const registry = userProfileRegistry();
    const response: GroundedResponse = {
      lines: [{ display: "Your GSTIN is 27AAPFU0939F1ZV", bindings: [] }],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)[0]?.reason).toBe(
      "unbound_factual_line",
    );
  });

  it("BV-08 prose Hello passes", () => {
    const registry = userProfileRegistry();
    const response: GroundedResponse = {
      lines: [{ display: "Hello!", bindings: [] }],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)).toHaveLength(0);
  });

  it("BV-09 instructions json binding", () => {
    const registry = userProfileRegistry();
    const instr = [...registry.values()].find((r) => r.field === "instructions")!;
    const response: GroundedResponse = {
      lines: [
        {
          display: 'Instructions: [""]',
          bindings: [
            {
              factId: instr.factId,
              field: "instructions",
              asShown: '[""]',
            },
          ],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)).toHaveLength(0);
  });

  it("BV-10 outcomeBinding valid denied", () => {
    const outcomes = new Map<string, OutcomeRecord>([
      [
        "deny_o1",
        {
          outcomeId: "deny_o1",
          objectiveId: "o1",
          kind: "denied",
          reason: "user_rejected",
          catalogLabel: "Denied",
        },
      ],
    ]);
    const response: GroundedResponse = {
      lines: [
        {
          display: "GST update was not applied.",
          outcomeBindings: [{ outcomeId: "deny_o1", kind: "denied" }],
        },
      ],
    };
    expect(verifyBindings(response, userProfileRegistry(), outcomes)).toHaveLength(0);
  });

  it("BV-11 outcomeBinding unknown id", () => {
    const response: GroundedResponse = {
      lines: [
        {
          display: "Not applied.",
          outcomeBindings: [{ outcomeId: "deny_missing", kind: "denied" }],
        },
      ],
    };
    expect(
      verifyBindings(response, userProfileRegistry(), emptyOutcomes)[0]?.reason,
    ).toBe("unknown_outcomeId");
  });
});

describe("verifyBindings INV catalog", () => {
  const emptyOutcomes = new Map<string, OutcomeRecord>();

  it("INV-01 Maggi quantity binding passes", () => {
    const registry = invRegistry();
    const maggi = registry.get(
      "inventory_check_stock_read_inventory_MAG-001_quantity",
    )!;
    const response: GroundedResponse = {
      lines: [
        {
          display: "Maggi packets in stock: 5",
          bindings: [
            {
              factId: maggi.factId,
              field: "quantity",
              asShown: "5",
            },
          ],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)).toHaveLength(0);
  });

  it("INV-02 wrong SKU value_mismatch", () => {
    const registry = invRegistry();
    const atta = registry.get(
      "inventory_check_stock_read_inventory_ATTA-001_quantity",
    )!;
    const response: GroundedResponse = {
      lines: [
        {
          display: "Maggi packets: 5",
          bindings: [{ factId: atta.factId, field: "quantity", asShown: "5" }],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)[0]?.reason).toBe(
      "value_mismatch",
    );
  });

  it("INV-03 wrong asShown value_mismatch", () => {
    const registry = invRegistry();
    const maggi = registry.get(
      "inventory_check_stock_read_inventory_MAG-001_quantity",
    )!;
    const response: GroundedResponse = {
      lines: [
        {
          display: "Maggi: 26",
          bindings: [
            { factId: maggi.factId, field: "quantity", asShown: "26" },
          ],
        },
      ],
    };
    expect(verifyBindings(response, registry, emptyOutcomes)[0]?.reason).toBe(
      "value_mismatch",
    );
  });
});
