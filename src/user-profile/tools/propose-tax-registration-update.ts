import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  getShopProfile,
  updateShopProfile,
} from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import { appendShopProfileHistory } from "../../store-durable-object/persistence/repositories/shop-profile-history-repository.js";
import {
  finalizeConfirmationResolution,
  persistPendingConfirmation,
} from "../../store-durable-object/runtime-ports/worker-delivery-port.js";
import { formatTaxConfirmationTable } from "../confirmation/format-confirmation-table.js";
import { isValidGstin, normalizeGstin } from "../validation/gstin.js";

export async function proposeTaxRegistrationUpdate(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  input: {
    gstRegistered: boolean;
    gstin?: string;
    chatId: number;
    updateId: number;
    correlationId: string;
  },
): Promise<Record<string, unknown>> {
  if (input.gstRegistered) {
    if (!input.gstin) {
      throw new Error("clarification:gstin_required");
    }
    const normalized = normalizeGstin(input.gstin);
    if (!isValidGstin(normalized)) {
      throw new Error("clarification:invalid_gstin");
    }
    input.gstin = normalized;
  } else if (input.gstin) {
    throw new Error("clarification:gstin_without_registration");
  }

  const current = await getShopProfile(db);

  if (current.completeAutonomy) {
    const before = await getShopProfile(db);
    const updated = await updateShopProfile(db, {
      gstRegistered: input.gstRegistered,
      gstin: input.gstRegistered ? input.gstin ?? null : null,
    });
    await appendShopProfileHistory(db, before, updated, {
      updateId: input.updateId,
      correlationId: input.correlationId,
    });
    return {
      gstRegistered: updated.gstRegistered,
      gstin: updated.gstin,
    };
  }

  const confirmationId = crypto.randomUUID();
  const display = formatTaxConfirmationTable({
    gstRegistered: input.gstRegistered,
    gstin: input.gstRegistered ? input.gstin! : "N/A",
  });

  await persistPendingConfirmation(db, {
    confirmationId,
    updateId: input.updateId,
    correlationId: input.correlationId,
    toolName: "propose_tax_registration_update",
    displayPayload: {
      gstRegistered: input.gstRegistered,
      gstin: input.gstin,
    },
    pendingWrite: {
      gstRegistered: input.gstRegistered,
      gstin: input.gstRegistered ? input.gstin : null,
    },
  });

  await runtimePorts.deliverConfirmation({
    confirmationId,
    chatId: input.chatId,
    text: display,
    replyMarkup: buildYesNoKeyboard(confirmationId),
  });

  const outcome = await runtimePorts.waitForConfirmation(
    confirmationId,
    current.confirmationTimeoutMs,
  );

  if (outcome === "approved") {
    await finalizeConfirmationResolution(db, {
      confirmationId,
      status: "approved",
    });
    const before = await getShopProfile(db);
    const updated = await updateShopProfile(db, {
      gstRegistered: input.gstRegistered,
      gstin: input.gstRegistered ? input.gstin ?? null : null,
    });
    await appendShopProfileHistory(db, before, updated, {
      updateId: input.updateId,
      correlationId: input.correlationId,
    });
    return {
      gstRegistered: updated.gstRegistered,
      gstin: updated.gstin,
    };
  }

  await finalizeConfirmationResolution(db, {
    confirmationId,
    status: outcome === "expired" ? "expired" : "denied",
  });

  throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
}
