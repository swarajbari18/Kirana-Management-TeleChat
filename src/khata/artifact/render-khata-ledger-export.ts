import type { KhataLedgerEntryRow } from "../../store-durable-object/persistence/repositories/khata-repository.js";
import { formatPaise } from "../confirmation/format-khata-confirmation-table.js";

export function renderKhataLedgerCsv(input: {
  title: string;
  customers: Array<{ canonicalName: string; customerId: string }>;
  entries: KhataLedgerEntryRow[];
}): string {
  const customerNameById = new Map(
    input.customers.map((c) => [c.customerId, c.canonicalName]),
  );
  const lines = [
    input.title,
    "customer,entry_type,amount,balance_after,reference_type,reference_id,notes,created_at",
  ];
  for (const entry of input.entries) {
    const customerName = customerNameById.get(entry.customerId) ?? entry.customerId;
    lines.push(
      [
        customerName,
        entry.entryType,
        formatPaise(entry.amountPaise),
        formatPaise(entry.balanceAfterPaise),
        entry.referenceType,
        entry.referenceId,
        entry.notes ?? "",
        entry.createdAt,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  return lines.join("\n");
}
