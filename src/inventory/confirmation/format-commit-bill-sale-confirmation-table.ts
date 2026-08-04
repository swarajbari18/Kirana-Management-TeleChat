export function formatCommitBillSaleConfirmationTable(input: {
  billId: string;
  customerName: string;
  lines: Array<{
    sku: string;
    productName: string;
    quantity: number;
    beforeQty: number;
    afterQty: number;
  }>;
}): string {
  const lines = [
    "Commit bill sale — reduce stock?",
    "",
    `Bill: ${input.billId.slice(0, 8)}`,
    `Customer: ${input.customerName}`,
    "",
    "Lines:",
  ];
  for (const line of input.lines) {
    lines.push(
      `- ${line.productName} (${line.sku}): qty ${line.quantity}, on hand ${line.beforeQty} → ${line.afterQty}`,
    );
  }
  lines.push("", "Confirm?");
  return lines.join("\n");
}
