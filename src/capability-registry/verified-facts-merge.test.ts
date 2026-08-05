import { describe, expect, it } from "vitest";
import { mergeToolVerifiedFacts } from "./verified-facts-merge.js";

describe("verified-facts merge", () => {
  it("preserves every query_inventory lookup instead of overwriting", () => {
    const facts: Record<string, unknown> = {};

    mergeToolVerifiedFacts(
      facts,
      {
        operationId: "op1",
        operationDescription: "lookup sugar",
        toolName: "query_inventory",
        parameters: { product_name: "sugar" },
        dependencies: [],
      },
      { exactMatchCount: 0, productName: "sugar", found: false },
    );

    mergeToolVerifiedFacts(
      facts,
      {
        operationId: "op2",
        operationDescription: "lookup butter",
        toolName: "query_inventory",
        parameters: { product_name: "Amul butter" },
        dependencies: [],
      },
      { exactMatchCount: 0, productName: "Amul butter", found: false },
    );

    expect(facts.productLookups).toEqual([
      {
        operationId: "op1",
        exactMatchCount: 0,
        productName: "sugar",
        found: false,
      },
      {
        operationId: "op2",
        exactMatchCount: 0,
        productName: "Amul butter",
        found: false,
      },
    ]);
  });
});
