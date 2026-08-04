export function formatRegisterConfirmationTable(input: {
  sku: string;
  productName: string;
  itemType: string;
  unit: string;
  quantity: number;
  costPrice: number;
  sellPrice: number;
  hsnCode: string;
  gstRate: number;
  reorderLevel: number;
  reorderDefaulted: boolean;
  aliases: string[];
  similarCandidates?: Array<{ productName: string; sku: string }>;
}): string {
  const lines = [
    "Register new inventory product?",
    "",
    `SKU: ${input.sku}`,
    `Product: ${input.productName}`,
    `Type: ${input.itemType} | Unit: ${input.unit}`,
    `Quantity: ${input.quantity}`,
    `Cost: ₹${input.costPrice} | Sell: ₹${input.sellPrice}`,
    `HSN: ${input.hsnCode} | GST: ${input.gstRate}%`,
    `Reorder level: ${input.reorderLevel}${input.reorderDefaulted ? " (default 20%)" : ""}`,
  ];
  if (input.aliases.length > 0) {
    lines.push(`Aliases: ${input.aliases.join(", ")}`);
  }
  if (input.similarCandidates && input.similarCandidates.length > 0) {
    lines.push("", "Similar existing products:");
    for (const c of input.similarCandidates) {
      lines.push(`- ${c.productName} (${c.sku})`);
    }
  }
  lines.push("", "Confirm?");
  return lines.join("\n");
}

export function formatUpdateConfirmationTable(input: {
  sku: string;
  productName: string;
  beforeQty: number;
  delta: number;
  afterQty: number;
  costPrice?: number;
  sellPrice?: number;
  reorderLevel?: number;
}): string {
  const lines = [
    "Update inventory?",
    "",
    `SKU: ${input.sku}`,
    `Product: ${input.productName}`,
    `Quantity: ${input.beforeQty} → ${input.afterQty} (+${input.delta})`,
  ];
  if (input.costPrice !== undefined) {
    lines.push(`Cost price: ₹${input.costPrice}`);
  }
  if (input.sellPrice !== undefined) {
    lines.push(`Sell price: ₹${input.sellPrice}`);
  }
  if (input.reorderLevel !== undefined) {
    lines.push(`Reorder level: ${input.reorderLevel}`);
  }
  lines.push("", "Confirm?");
  return lines.join("\n");
}

export function formatAllocateConfirmationTable(input: {
  sku: string;
  productName: string;
  operation: string;
  quantity: number;
  available: number;
  draftBillId: string;
}): string {
  return [
    `${input.operation} inventory buffer?`,
    "",
    `Product: ${input.productName} (${input.sku})`,
    `Quantity: ${input.quantity}`,
    `Available: ${input.available}`,
    `Draft bill: ${input.draftBillId}`,
    "",
    "Confirm?",
  ].join("\n");
}
