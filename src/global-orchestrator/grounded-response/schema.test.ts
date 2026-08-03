import { describe, expect, it } from "vitest";
import { validateGroundedResponse } from "./schema.js";

describe("validateGroundedResponse", () => {
  it("accepts valid grounded response", () => {
    const result = validateGroundedResponse({
      lines: [
        {
          display: "Shop name: Bantu Kirana",
          bindings: [
            {
              factId: "my_shop_profile_o1_read_shop_profile_shopName",
              field: "shopName",
              asShown: "Bantu Kirana",
            },
          ],
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing lines array", () => {
    const result = validateGroundedResponse({});
    expect(result.valid).toBe(false);
  });

  it("rejects empty display", () => {
    const result = validateGroundedResponse({
      lines: [{ display: "", bindings: [] }],
    });
    expect(result.valid).toBe(false);
  });
});
