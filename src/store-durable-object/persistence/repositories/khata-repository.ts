import { and, desc, eq } from "drizzle-orm";
import type { StoreDatabase } from "../db.js";
import {
  khataCustomerAliases,
  khataCustomers,
  khataLedgerEntries,
} from "../schema.js";
import { normalizeProductKey } from "./inventory-repository.js";

export type KhataEntryType = "credit_sale" | "manual_credit" | "payment";

export interface KhataCustomerRow {
  id: string;
  canonicalName: string;
  normalizedName: string;
  createdAt: string;
}

export interface KhataCustomerMatch {
  id: string;
  canonicalName: string;
  normalizedName: string;
}

export interface KhataLedgerEntryRow {
  id: string;
  customerId: string;
  entryType: KhataEntryType;
  amountPaise: number;
  referenceType: string;
  referenceId: string;
  balanceAfterPaise: number;
  notes: string | null;
  updateId: number;
  correlationId: string;
  createdAt: string;
}

export interface CustomerBalanceSummary {
  customerId: string;
  canonicalName: string;
  balanceAfterPaise: number;
  hasLedgerHistory: boolean;
}

export function normalizeCustomerName(name: string): string {
  return normalizeProductKey(name);
}

function rowToCustomer(
  row: typeof khataCustomers.$inferSelect,
): KhataCustomerRow {
  return {
    id: row.id,
    canonicalName: row.canonicalName,
    normalizedName: row.normalizedName,
    createdAt: row.createdAt,
  };
}

function rowToMatch(row: KhataCustomerRow): KhataCustomerMatch {
  return {
    id: row.id,
    canonicalName: row.canonicalName,
    normalizedName: row.normalizedName,
  };
}

export async function listAllCustomers(
  db: StoreDatabase,
): Promise<KhataCustomerRow[]> {
  const rows = await db.select().from(khataCustomers);
  return rows.map(rowToCustomer);
}

export async function findCustomerByNormalizedName(
  db: StoreDatabase,
  normalizedName: string,
): Promise<KhataCustomerRow | null> {
  const row = await db
    .select()
    .from(khataCustomers)
    .where(eq(khataCustomers.normalizedName, normalizedName))
    .get();
  return row ? rowToCustomer(row) : null;
}

export async function searchCustomersExact(
  db: StoreDatabase,
  customerName: string,
): Promise<KhataCustomerMatch[]> {
  const normalized = normalizeCustomerName(customerName);
  const customers = await listAllCustomers(db);
  const aliasRows = await db.select().from(khataCustomerAliases);
  const aliasByCustomer = new Map<string, string[]>();
  for (const alias of aliasRows) {
    const list = aliasByCustomer.get(alias.customerId) ?? [];
    list.push(alias.alias);
    aliasByCustomer.set(alias.customerId, list);
  }

  const matches: KhataCustomerMatch[] = [];
  for (const customer of customers) {
    if (customer.normalizedName === normalized) {
      matches.push(rowToMatch(customer));
      continue;
    }
    const aliases = aliasByCustomer.get(customer.id) ?? [];
    if (aliases.some((alias) => normalizeCustomerName(alias) === normalized)) {
      matches.push(rowToMatch(customer));
    }
  }
  return matches;
}

export async function searchSimilarCustomers(
  db: StoreDatabase,
  customerName: string,
  limit = 5,
): Promise<Array<KhataCustomerMatch & { score: number }>> {
  const customers = await listAllCustomers(db);
  const normalizedQuery = normalizeCustomerName(customerName);

  function score(query: string, candidate: string): number {
    const a = normalizeCustomerName(query);
    const b = normalizeCustomerName(candidate);
    if (!a || !b) {
      return 0;
    }
    if (a === b) {
      return 1;
    }
    if (a.includes(b) || b.includes(a)) {
      return 0.85;
    }
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) {
      return 0;
    }
    let distance = 0;
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1,
          );
        }
      }
    }
    distance = matrix[b.length]![a.length]!;
    return 1 - distance / maxLen;
  }

  return customers
    .map((c) => ({
      id: c.id,
      canonicalName: c.canonicalName,
      normalizedName: c.normalizedName,
      score: score(normalizedQuery, c.canonicalName),
    }))
    .filter((entry) => entry.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** @deprecated Use insertCustomer after confirmation — never silent create */
export async function resolveOrCreateCustomer(
  db: StoreDatabase,
  customerName: string,
): Promise<KhataCustomerRow> {
  const normalized = normalizeCustomerName(customerName);
  const existing = await findCustomerByNormalizedName(db, normalized);
  if (existing) {
    return existing;
  }
  return insertCustomer(db, { canonicalName: customerName.trim(), aliases: [] });
}

export async function insertCustomer(
  db: StoreDatabase,
  input: {
    canonicalName: string;
    aliases?: string[];
    updateId?: number;
    correlationId?: string;
  },
): Promise<KhataCustomerRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const normalized = normalizeCustomerName(input.canonicalName);

  await db.transaction(async (tx) => {
    await tx.insert(khataCustomers).values({
      id,
      canonicalName: input.canonicalName.trim(),
      normalizedName: normalized,
      createdAt: now,
    });

    for (const alias of input.aliases ?? []) {
      const aliasNorm = normalizeCustomerName(alias);
      if (!aliasNorm) {
        continue;
      }
      await tx.insert(khataCustomerAliases).values({
        customerId: id,
        alias: aliasNorm,
      });
    }
  });

  const created = await findCustomerByNormalizedName(db, normalized);
  if (!created) {
    throw new Error("Post-create verify failed: customer not found");
  }
  return created;
}

export async function getLatestBalancePaise(
  db: StoreDatabase,
  customerId: string,
): Promise<number> {
  const row = await db
    .select()
    .from(khataLedgerEntries)
    .where(eq(khataLedgerEntries.customerId, customerId))
    .orderBy(desc(khataLedgerEntries.createdAt))
    .get();
  return row?.balanceAfterPaise ?? 0;
}

export async function findCreditSaleByBillId(
  db: StoreDatabase,
  billId: string,
): Promise<KhataLedgerEntryRow | null> {
  const row = await db
    .select()
    .from(khataLedgerEntries)
    .where(
      and(
        eq(khataLedgerEntries.referenceType, "bill"),
        eq(khataLedgerEntries.referenceId, billId),
        eq(khataLedgerEntries.entryType, "credit_sale"),
      ),
    )
    .get();
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    customerId: row.customerId,
    entryType: row.entryType as KhataEntryType,
    amountPaise: row.amountPaise,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    balanceAfterPaise: row.balanceAfterPaise,
    notes: row.notes,
    updateId: row.updateId,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  };
}

async function appendLedgerEntry(
  db: StoreDatabase,
  input: {
    customerId: string;
    entryType: KhataEntryType;
    amountPaise: number;
    referenceType: string;
    referenceId: string;
    notes?: string | null;
    updateId: number;
    correlationId: string;
    balanceDelta: number;
  },
): Promise<KhataLedgerEntryRow> {
  const priorBalance = await getLatestBalancePaise(db, input.customerId);
  const balanceAfter = priorBalance + input.balanceDelta;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(khataLedgerEntries).values({
    id,
    customerId: input.customerId,
    entryType: input.entryType,
    amountPaise: input.amountPaise,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    balanceAfterPaise: balanceAfter,
    notes: input.notes ?? null,
    updateId: input.updateId,
    correlationId: input.correlationId,
    createdAt: now,
  });

  const verify = await getLatestBalancePaise(db, input.customerId);
  if (verify !== balanceAfter) {
    throw new Error("Post-write verify failed: khata balance mismatch");
  }

  return {
    id,
    customerId: input.customerId,
    entryType: input.entryType,
    amountPaise: input.amountPaise,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    balanceAfterPaise: balanceAfter,
    notes: input.notes ?? null,
    updateId: input.updateId,
    correlationId: input.correlationId,
    createdAt: now,
  };
}

/** @deprecated Use appendCreditSaleFromBill */
export async function appendCreditSaleEntry(
  db: StoreDatabase,
  input: {
    customerId: string;
    amountPaise: number;
    billId: string;
    notes?: string;
    updateId: number;
    correlationId: string;
  },
): Promise<KhataLedgerEntryRow> {
  return appendCreditSaleFromBill(db, input);
}

export async function appendCreditSaleFromBill(
  db: StoreDatabase,
  input: {
    customerId: string;
    amountPaise: number;
    billId: string;
    notes?: string;
    updateId: number;
    correlationId: string;
  },
): Promise<KhataLedgerEntryRow> {
  const existing = await findCreditSaleByBillId(db, input.billId);
  if (existing) {
    return existing;
  }

  return appendLedgerEntry(db, {
    customerId: input.customerId,
    entryType: "credit_sale",
    amountPaise: input.amountPaise,
    referenceType: "bill",
    referenceId: input.billId,
    notes: input.notes,
    updateId: input.updateId,
    correlationId: input.correlationId,
    balanceDelta: input.amountPaise,
  });
}

export async function appendManualCredit(
  db: StoreDatabase,
  input: {
    customerId: string;
    amountPaise: number;
    notes?: string;
    updateId: number;
    correlationId: string;
  },
): Promise<KhataLedgerEntryRow> {
  const referenceId = crypto.randomUUID();
  return appendLedgerEntry(db, {
    customerId: input.customerId,
    entryType: "manual_credit",
    amountPaise: input.amountPaise,
    referenceType: "manual",
    referenceId,
    notes: input.notes,
    updateId: input.updateId,
    correlationId: input.correlationId,
    balanceDelta: input.amountPaise,
  });
}

export async function appendPayment(
  db: StoreDatabase,
  input: {
    customerId: string;
    amountPaise: number;
    notes?: string;
    updateId: number;
    correlationId: string;
  },
): Promise<KhataLedgerEntryRow> {
  const referenceId = crypto.randomUUID();
  return appendLedgerEntry(db, {
    customerId: input.customerId,
    entryType: "payment",
    amountPaise: input.amountPaise,
    referenceType: "manual",
    referenceId,
    notes: input.notes,
    updateId: input.updateId,
    correlationId: input.correlationId,
    balanceDelta: -input.amountPaise,
  });
}

export async function listRecentEntries(
  db: StoreDatabase,
  customerId: string,
  limit = 5,
): Promise<KhataLedgerEntryRow[]> {
  const rows = await db
    .select()
    .from(khataLedgerEntries)
    .where(eq(khataLedgerEntries.customerId, customerId))
    .orderBy(desc(khataLedgerEntries.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    customerId: row.customerId,
    entryType: row.entryType as KhataEntryType,
    amountPaise: row.amountPaise,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    balanceAfterPaise: row.balanceAfterPaise,
    notes: row.notes,
    updateId: row.updateId,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  }));
}

export async function listAllCustomersWithBalances(
  db: StoreDatabase,
): Promise<CustomerBalanceSummary[]> {
  const customers = await listAllCustomers(db);
  const summaries: CustomerBalanceSummary[] = [];

  for (const customer of customers) {
    const entries = await db
      .select()
      .from(khataLedgerEntries)
      .where(eq(khataLedgerEntries.customerId, customer.id));
    const balance = await getLatestBalancePaise(db, customer.id);
    if (balance !== 0 || entries.length > 0) {
      summaries.push({
        customerId: customer.id,
        canonicalName: customer.canonicalName,
        balanceAfterPaise: balance,
        hasLedgerHistory: entries.length > 0,
      });
    }
  }

  return summaries;
}

export async function exportFullLedger(
  db: StoreDatabase,
  customerId?: string,
): Promise<KhataLedgerEntryRow[]> {
  const query = db
    .select()
    .from(khataLedgerEntries)
    .orderBy(desc(khataLedgerEntries.createdAt));

  const rows = customerId
    ? await query.where(eq(khataLedgerEntries.customerId, customerId))
    : await query;

  return rows.map((row) => ({
    id: row.id,
    customerId: row.customerId,
    entryType: row.entryType as KhataEntryType,
    amountPaise: row.amountPaise,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    balanceAfterPaise: row.balanceAfterPaise,
    notes: row.notes,
    updateId: row.updateId,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  }));
}

export async function getCustomerBalanceAfterBill(
  db: StoreDatabase,
  customerId: string,
  billId: string,
): Promise<number | null> {
  const match = await findCreditSaleByBillId(db, billId);
  if (!match || match.customerId !== customerId) {
    return null;
  }
  return match.balanceAfterPaise;
}
