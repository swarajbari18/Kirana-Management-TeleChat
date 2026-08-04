import type { DraftProjection, ManageDraftOperation } from "./types.js";
import { DraftStateError } from "./errors.js";

const OPS_NEEDING_EXISTING_DRAFT = new Set<ManageDraftOperation>([
  "set_customer",
  "set_notes",
  "add_item",
  "remove_item",
  "change_item_quantity",
  "set_payment_method",
  "set_payment_reference",
  "show_draft",
  "cancel_draft",
]);

const MUTATING_OPS = new Set<ManageDraftOperation>([
  "start_bill",
  "set_customer",
  "set_notes",
  "add_item",
  "remove_item",
  "change_item_quantity",
  "set_payment_method",
  "set_payment_reference",
  "cancel_draft",
]);

export function validateOperationAgainstStateMachine(
  operation: ManageDraftOperation,
  projection: DraftProjection | null,
  createNew: boolean,
): void {
  if (operation === "start_bill" && !createNew && projection?.started) {
    throw new DraftStateError("clarification:Draft already started for this bill.");
  }

  if (OPS_NEEDING_EXISTING_DRAFT.has(operation)) {
    if (!projection?.started) {
      throw new DraftStateError(
        "clarification:Bill not created — start_bill is required before this operation.",
      );
    }
  }

  if (operation === "add_item" && !createNew && !projection?.started) {
    throw new DraftStateError(
      "clarification:Bill not created — cannot add_item without start_bill.",
    );
  }
}

export function isMutatingOperation(operation: ManageDraftOperation): boolean {
  return MUTATING_OPS.has(operation);
}
