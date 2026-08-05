/** Inventory `costPrice` / `sellPrice` are whole rupees; billing stores integer paise. */
export function inventoryRupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
