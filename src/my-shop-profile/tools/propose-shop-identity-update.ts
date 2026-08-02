import { buildYesNoKeyboard } from "../../worker-telegram-adapter/callback-parser.js";
import type { RuntimePorts } from "../../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import {
  getShopProfile,
  updateShopProfile,
} from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";
import {
  finalizeConfirmationResolution,
  persistPendingConfirmation,
} from "../../store-durable-object/runtime-ports/worker-delivery-port.js";
import { formatIdentityConfirmationTable } from "../confirmation/format-confirmation-table.js";

export async function proposeShopIdentityUpdate(
  db: StoreDatabase,
  runtimePorts: RuntimePorts,
  input: {
    shopName?: string;
    ownerName?: string;
    chatId: number;
    updateId: number;
    correlationId: string;
  },
): Promise<Record<string, unknown>> {
  const current = await getShopProfile(db);
  const nextShopName = input.shopName ?? current.shopName;
  const nextOwnerName = input.ownerName ?? current.ownerName;

  const replacingExisting =
    (input.shopName !== undefined &&
      current.shopName !== null &&
      input.shopName !== current.shopName) ||
    (input.ownerName !== undefined &&
      current.ownerName !== null &&
      input.ownerName !== current.ownerName);

  if (!replacingExisting || current.completeAutonomy) {
    const updated = await updateShopProfile(db, {
      shopName: nextShopName,
      ownerName: nextOwnerName,
    });
    return {
      shopName: updated.shopName,
      ownerName: updated.ownerName,
    };
  }

  const confirmationId = crypto.randomUUID();
  const display = formatIdentityConfirmationTable({
    shopName: input.shopName,
    ownerName: input.ownerName,
  });

  await persistPendingConfirmation(db, {
    confirmationId,
    updateId: input.updateId,
    correlationId: input.correlationId,
    toolName: "propose_shop_identity_update",
    displayPayload: { shopName: input.shopName, ownerName: input.ownerName },
    pendingWrite: { shopName: nextShopName, ownerName: nextOwnerName },
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
    const updated = await updateShopProfile(db, {
      shopName: nextShopName,
      ownerName: nextOwnerName,
    });
    return {
      shopName: updated.shopName,
      ownerName: updated.ownerName,
    };
  }

  await finalizeConfirmationResolution(db, {
    confirmationId,
    status: outcome === "expired" ? "expired" : "denied",
  });

  throw new Error(outcome === "expired" ? "timeout" : "user_rejected");
}
