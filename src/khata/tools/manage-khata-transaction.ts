import type { ToolExecutionPlanContext } from "../../capability-registry/capability-blueprint.js";
import type { AgentStatePriorResults } from "../../capability-registry/capability-blueprint.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  getFinalizedBill,
} from "../../store-durable-object/persistence/repositories/billing-repository.js";
import {
  appendCreditSaleFromBill,
  appendManualCredit,
  appendPayment,
  findCustomerByNormalizedName,
  getLatestBalancePaise,
  insertCustomer,
  normalizeCustomerName,
  searchCustomersExact,
  searchSimilarCustomers,
} from "../../store-durable-object/persistence/repositories/khata-repository.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import {
  finalizeConfirmationResolution,
  persistPendingConfirmation,
} from "../../store-durable-object/runtime-ports/worker-delivery-port.js";
import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import { getPriorQueryKhataResult } from "../agent-state.js";
import {
  formatCreditFromBillConfirmation,
  formatCreateCustomerConfirmation,
  formatManualCreditConfirmation,
  formatPaymentConfirmation,
  formatPaymentWithCreateCustomerConfirmation,
} from "../confirmation/format-khata-confirmation-table.js";
import { ClarificationError } from "../errors.js";
import {
  formatExactCustomersMessage,
  formatSimilarCustomersMessage,
} from "../search/customer-search.js";
import { resolveCustomerForKhataPayment } from "../search/customer-write-lookup.js";
import type { KhataManageOperation } from "../types.js";

function parseAmountPaise(params: Record<string, unknown>): number {
  if (params.amount_paise !== undefined) {
    const paise = Math.round(Number(params.amount_paise));
    if (!Number.isFinite(paise) || paise <= 0) {
      throw new ClarificationError("Valid amount_paise is required.");
    }
    return paise;
  }
  const raw = String(params.amount ?? "").replace(/[₹,\s]/g, "");
  const rupees = Number(raw);
  if (!Number.isFinite(rupees) || rupees <= 0) {
    throw new ClarificationError("Valid amount is required.");
  }
  return Math.round(rupees * 100);
}

function resolveBillId(
  params: Record<string, unknown>,
  planContext: ToolExecutionPlanContext,
): string | null {
  if (typeof params.bill_id === "string" && params.bill_id.length > 0) {
    return params.bill_id;
  }
  for (const facts of Object.values(planContext.priorObjectiveResults ?? {})) {
    if (facts.finalized === true && typeof facts.bill_id === "string") {
      return facts.bill_id;
    }
  }
  return null;
}

async function resolveCustomerByName(
  db: StoreDatabase,
  customerName: string,
  priorResults: AgentStatePriorResults,
  allowPriorQuery = true,
) {
  if (allowPriorQuery) {
    const priorQuery = getPriorQueryKhataResult(priorResults);
    if (priorQuery?.exactMatchCount === 1 && priorQuery.exactMatches[0]) {
      return priorQuery.exactMatches[0];
    }
  }

  const exactMatches = await searchCustomersExact(db, customerName);
  if (exactMatches.length > 1) {
    throw new ClarificationError(
      `Multiple exact customer matches found.\n${formatExactCustomersMessage(exactMatches)}`,
      { exactMatches },
    );
  }
  if (exactMatches.length === 1) {
    return exactMatches[0]!;
  }

  const similar = await searchSimilarCustomers(db, customerName);
  throw new ClarificationError(
    `Customer "${customerName}" not found. Did you mean one of these?\n${formatSimilarCustomersMessage(similar)}`,
    { similarCandidates: similar },
  );
}

async function withConfirmation<T>(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  ctx: { chatId: number; updateId: number; correlationId: string },
  toolName: string,
  display: string,
  pendingWrite: Record<string, unknown>,
  apply: () => Promise<T>,
): Promise<T> {
  const profile = await getShopProfile(db);
  if (profile.completeAutonomy) {
    return apply();
  }

  const confirmationId = crypto.randomUUID();
  await persistPendingConfirmation(db, {
    confirmationId,
    updateId: ctx.updateId,
    correlationId: ctx.correlationId,
    toolName,
    displayPayload: pendingWrite,
    pendingWrite,
  });

  await runtimePorts.deliverConfirmation({
    confirmationId,
    chatId: ctx.chatId,
    text: display,
    replyMarkup: buildYesNoKeyboard(confirmationId),
  });

  const outcome = await runtimePorts.waitForConfirmation(
    confirmationId,
    profile.confirmationTimeoutMs,
  );

  if (outcome === "approved") {
    await finalizeConfirmationResolution(db, {
      confirmationId,
      status: "approved",
    });
    return apply();
  }

  await finalizeConfirmationResolution(db, {
    confirmationId,
    status: outcome === "expired" ? "expired" : "denied",
  });
  throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
}

export async function manageKhataTransaction(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  params: Record<string, unknown>,
  priorResults: AgentStatePriorResults,
  planContext: ToolExecutionPlanContext,
  ctx: {
    chatId: number;
    updateId: number;
    correlationId: string;
  },
): Promise<{
  verifiedFacts: Record<string, unknown>;
  agentState: Record<string, unknown>;
}> {
  const operation = String(params.operation ?? "") as KhataManageOperation;

  if (operation === "create_customer") {
    const canonicalName =
      typeof params.customer_name === "string"
        ? params.customer_name
        : undefined;
    if (!canonicalName) {
      throw new ClarificationError("customer_name is required for create_customer.");
    }

    const priorQuery = getPriorQueryKhataResult(priorResults);
    if (!priorQuery) {
      throw new Error(
        "Invariant violation: create_customer requires prior query_khata",
      );
    }

    if (priorQuery.exactMatchCount >= 1) {
      throw new ClarificationError(
        `Customer already exists: ${priorQuery.exactMatches[0]!.canonicalName}. Use record_manual_credit or record_payment instead.\n${formatExactCustomersMessage(priorQuery.exactMatches)}`,
        { exactMatches: priorQuery.exactMatches },
      );
    }

    const aliases = Array.isArray(params.aliases)
      ? params.aliases.map(String)
      : [];

    const display = formatCreateCustomerConfirmation({
      canonicalName,
      aliases,
    });

    const apply = async () => {
      const customer = await insertCustomer(db, {
        canonicalName,
        aliases,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });
      return {
        verifiedFacts: {
          customer_id: customer.id,
          customer_name: customer.canonicalName,
          created: true,
        },
        agentState: {
          customerId: customer.id,
          created: true,
        },
      };
    };

    return withConfirmation(
      db,
      runtimePorts,
      ctx,
      "manage_khata_transaction",
      display,
      { operation, canonicalName, aliases },
      apply,
    );
  }

  if (operation === "record_manual_credit") {
    const customerName =
      typeof params.customer_name === "string"
        ? params.customer_name
        : undefined;
    if (!customerName) {
      throw new ClarificationError("customer_name is required.");
    }

    const customer = await resolveCustomerByName(
      db,
      customerName,
      priorResults,
    );
    const amountPaise = parseAmountPaise(params);
    const notes =
      typeof params.notes === "string" ? params.notes : undefined;
    const currentBalance = await getLatestBalancePaise(db, customer.id);

    const display = formatManualCreditConfirmation({
      customerName: customer.canonicalName,
      amountPaise,
      currentBalancePaise: currentBalance,
      notes,
    });

    const apply = async () => {
      const entry = await appendManualCredit(db, {
        customerId: customer.id,
        amountPaise,
        notes,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });
      return {
        verifiedFacts: {
          customer_id: customer.id,
          customer_name: customer.canonicalName,
          entry_type: "manual_credit",
          amount_paise: amountPaise,
          balance_after_paise: entry.balanceAfterPaise,
          entry_id: entry.id,
        },
        agentState: {
          customerId: customer.id,
          entryId: entry.id,
          balanceAfterPaise: entry.balanceAfterPaise,
        },
      };
    };

    return withConfirmation(
      db,
      runtimePorts,
      ctx,
      "manage_khata_transaction",
      display,
      { operation, customerId: customer.id, amountPaise, notes },
      apply,
    );
  }

  if (operation === "record_payment") {
    const customerName =
      typeof params.customer_name === "string"
        ? params.customer_name
        : undefined;
    if (!customerName) {
      throw new ClarificationError("customer_name is required.");
    }

    const amountPaise = parseAmountPaise(params);
    const notes =
      typeof params.notes === "string" ? params.notes : undefined;

    const lookup = await resolveCustomerForKhataPayment(
      db,
      customerName,
      priorResults,
    );

    if (lookup.status === "not_found") {
      const display = formatPaymentWithCreateCustomerConfirmation({
        customerName: lookup.customerName,
        amountPaise,
        notes,
      });

      const apply = async () => {
        const customer = await insertCustomer(db, {
          canonicalName: lookup.customerName,
          updateId: ctx.updateId,
          correlationId: ctx.correlationId,
        });
        const entry = await appendPayment(db, {
          customerId: customer.id,
          amountPaise,
          notes,
          updateId: ctx.updateId,
          correlationId: ctx.correlationId,
        });
        return {
          verifiedFacts: {
            customer_id: customer.id,
            customer_name: customer.canonicalName,
            entry_type: "payment",
            amount_paise: amountPaise,
            balance_after_paise: entry.balanceAfterPaise,
            entry_id: entry.id,
            customer_created: true,
          },
          agentState: {
            customerId: customer.id,
            entryId: entry.id,
            balanceAfterPaise: entry.balanceAfterPaise,
            customerCreated: true,
          },
        };
      };

      return withConfirmation(
        db,
        runtimePorts,
        ctx,
        "manage_khata_transaction",
        display,
        {
          operation,
          createCustomer: true,
          customerName: lookup.customerName,
          amountPaise,
          notes,
        },
        apply,
      );
    }

    const customer = lookup.customer;
    const currentBalance = await getLatestBalancePaise(db, customer.id);

    const display = formatPaymentConfirmation({
      customerName: customer.canonicalName,
      amountPaise,
      currentBalancePaise: currentBalance,
      notes,
    });

    const apply = async () => {
      const entry = await appendPayment(db, {
        customerId: customer.id,
        amountPaise,
        notes,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });
      return {
        verifiedFacts: {
          customer_id: customer.id,
          customer_name: customer.canonicalName,
          entry_type: "payment",
          amount_paise: amountPaise,
          balance_after_paise: entry.balanceAfterPaise,
          entry_id: entry.id,
        },
        agentState: {
          customerId: customer.id,
          entryId: entry.id,
          balanceAfterPaise: entry.balanceAfterPaise,
        },
      };
    };

    return withConfirmation(
      db,
      runtimePorts,
      ctx,
      "manage_khata_transaction",
      display,
      { operation, customerId: customer.id, amountPaise, notes },
      apply,
    );
  }

  if (operation === "record_credit_from_bill") {
    const billId = resolveBillId(params, planContext);
    if (!billId) {
      throw new Error(
        "record_credit_from_bill requires bill_id from billing dependency facts",
      );
    }

    const bill = await getFinalizedBill(db, billId);
    if (!bill) {
      throw new Error(`Bill ${billId} is not finalized`);
    }
    if (bill.paymentMethod !== "khata") {
      throw new Error(
        `Bill ${billId} payment method is ${bill.paymentMethod}, not khata`,
      );
    }

    const normalized = normalizeCustomerName(bill.customerName);
    let customer = await findCustomerByNormalizedName(db, normalized);
    const createCustomer = !customer;

    const display = formatCreditFromBillConfirmation({
      billId,
      customerName: bill.customerName,
      amountPaise: bill.grandTotalPaise,
      createCustomer,
      currentBalancePaise: customer
        ? await getLatestBalancePaise(db, customer.id)
        : undefined,
    });

    const apply = async () => {
      if (!customer) {
        customer = await insertCustomer(db, {
          canonicalName: bill.customerName,
          updateId: ctx.updateId,
          correlationId: ctx.correlationId,
        });
      }

      const entry = await appendCreditSaleFromBill(db, {
        customerId: customer.id,
        amountPaise: bill.grandTotalPaise,
        billId,
        notes: bill.notes ?? undefined,
        updateId: ctx.updateId,
        correlationId: ctx.correlationId,
      });

      return {
        verifiedFacts: {
          bill_id: billId,
          customer_id: customer.id,
          customer_name: customer.canonicalName,
          entry_type: "credit_sale",
          amount_paise: bill.grandTotalPaise,
          balance_after_paise: entry.balanceAfterPaise,
          entry_id: entry.id,
          customer_created: createCustomer,
        },
        agentState: {
          billId,
          customerId: customer.id,
          entryId: entry.id,
          balanceAfterPaise: entry.balanceAfterPaise,
        },
      };
    };

    return withConfirmation(
      db,
      runtimePorts,
      ctx,
      "manage_khata_transaction",
      display,
      { operation, billId, createCustomer },
      apply,
    );
  }

  throw new Error(`Unknown khata operation: ${operation}`);
}
