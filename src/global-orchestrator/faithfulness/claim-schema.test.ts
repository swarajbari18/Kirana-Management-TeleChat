import { describe, expect, it } from "vitest";
import { validateClaimsPayload } from "./claim-schema.js";

describe("validateClaimsPayload", () => {
  it("accepts valid claims", () => {
    const result = validateClaimsPayload({
      claims: [
        {
          text: "GSTIN is 22AAAAA0000A1Z5",
          entity: "shop",
          attribute: "gstin",
          value: "22AAAAA0000A1Z5",
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid keys", () => {
    const result = validateClaimsPayload({
      claims: [{ foo: "bar" }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects missing claims array", () => {
    const result = validateClaimsPayload({});
    expect(result.valid).toBe(false);
  });
});
