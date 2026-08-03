import { describe, expect, it } from "vitest";
import { findUnsupportedClaims } from "./fact-matcher.js";
import type { CanonicalFact } from "../../store-durable-object/agent-state/run-context.js";

describe("findUnsupportedClaims", () => {
  const facts: CanonicalFact[] = [
    {
      entity: "shop",
      attribute: "gstin",
      value: "22AAAAA0000A1Z5",
      source: "my_shop_profile",
    },
    {
      entity: "shop",
      attribute: "shop_name",
      value: "Maggi Store",
      source: "my_shop_profile",
    },
  ];

  it("flags claim with wrong value", () => {
    const unsupported = findUnsupportedClaims(
      [
        {
          text: "Your GSTIN is 99ZZZZZ9999Z9Z9",
          entity: "shop",
          attribute: "gstin",
          value: "99ZZZZZ9999Z9Z9",
        },
      ],
      facts,
    );
    expect(unsupported).toHaveLength(1);
  });

  it("passes matching claim", () => {
    const unsupported = findUnsupportedClaims(
      [
        {
          text: "Your shop is Maggi Store",
          entity: "shop",
          attribute: "shop_name",
          value: "Maggi Store",
        },
      ],
      facts,
    );
    expect(unsupported).toHaveLength(0);
  });

  it("flags unknown attribute", () => {
    const unsupported = findUnsupportedClaims(
      [
        {
          text: "Revenue is 1000",
          entity: "shop",
          attribute: "revenue",
          value: "1000",
        },
      ],
      facts,
    );
    expect(unsupported).toHaveLength(1);
  });
});
