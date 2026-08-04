import { describe, expect, it } from "vitest";
import { formatTaxConfirmationTable } from "./format-confirmation-table.js";

describe("formatTaxConfirmationTable", () => {
  it("renders deterministic table rows", () => {
    const table = formatTaxConfirmationTable({
      gstRegistered: true,
      gstin: "27AAPFU0939F1ZV",
    });
    expect(table).toContain("27AAPFU0939F1ZV");
    expect(table).toContain("GST Registered | Yes");
    expect(table).toContain("Tap Yes to save");
  });
});
