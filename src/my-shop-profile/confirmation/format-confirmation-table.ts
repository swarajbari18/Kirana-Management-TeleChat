export function formatTaxConfirmationTable(fields: {
  gstRegistered: boolean;
  gstin: string;
}): string {
  return [
    "Please confirm your tax registration details:",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| GST Registered | ${fields.gstRegistered ? "Yes" : "No"} |`,
    `| GSTIN | ${fields.gstin} |`,
    "",
    "Tap Yes to save, or No to cancel.",
  ].join("\n");
}

export function formatIdentityConfirmationTable(fields: {
  shopName?: string | null;
  ownerName?: string | null;
}): string {
  const rows = [
    "Please confirm your shop identity update:",
    "",
    "| Field | Value |",
    "|-------|-------|",
  ];
  if (fields.shopName) {
    rows.push(`| Shop Name | ${fields.shopName} |`);
  }
  if (fields.ownerName) {
    rows.push(`| Owner Name | ${fields.ownerName} |`);
  }
  rows.push("", "Tap Yes to save, or No to cancel.");
  return rows.join("\n");
}
