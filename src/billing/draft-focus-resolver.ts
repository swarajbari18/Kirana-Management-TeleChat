import type { BusinessObjective } from "../capability-registry/index.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import {
  buildOpenDraftSummaries,
  findOpenDraftsByCustomer,
  getLatestOpenDraft,
  type OpenDraftSummary,
} from "../store-durable-object/persistence/repositories/billing-repository.js";
import type { DraftTarget } from "./types.js";
import { ClarificationError } from "./errors.js";

export interface DraftFocusResolution {
  billId?: string;
  draftTarget: DraftTarget;
  createNew: boolean;
}

function formatDraftLabel(summary: OpenDraftSummary): string {
  const customer = summary.customerName ?? "No customer";
  return `${customer} — ${summary.lineCount} line(s), last edited ${summary.lastEventAt}`;
}

function buildAmbiguousMessage(summaries: OpenDraftSummary[]): string {
  const lines = summaries.map((s, i) => `${i + 1}. ${formatDraftLabel(s)}`);
  return `Multiple open drafts found. Which bill?\n${lines.join("\n")}`;
}

export function resolveEffectiveDraftTarget(
  params: Record<string, unknown>,
  objective: BusinessObjective,
): DraftTarget {
  const paramTarget = params.draft_target as DraftTarget | undefined;
  if (paramTarget) {
    return paramTarget;
  }
  if (objective.draftTarget) {
    return objective.draftTarget;
  }
  return "implicit_latest";
}

export async function resolveDraftFocus(
  db: StoreDatabase,
  params: Record<string, unknown>,
  objective: BusinessObjective,
  operation: string,
): Promise<DraftFocusResolution> {
  const draftTarget = resolveEffectiveDraftTarget(params, objective);

  if (draftTarget === "new" || operation === "start_bill") {
    return { billId: crypto.randomUUID(), draftTarget, createNew: true };
  }

  if (draftTarget === "by_customer") {
    const customerName =
      (params.customer_name as string | undefined) ??
      objective.customerName ??
      objective.description;
    const matches = await findOpenDraftsByCustomer(db, customerName);
    if (matches.length === 0) {
      throw new ClarificationError(
        `No open draft found for customer "${customerName}". Start a new bill or pick another draft.`,
      );
    }
    if (matches.length > 1) {
      throw new ClarificationError(buildAmbiguousMessage(matches), {
        draftOptions: matches.map(formatDraftLabel),
      });
    }
    return {
      billId: matches[0]!.billId,
      draftTarget,
      createNew: false,
    };
  }

  if (draftTarget === "ambiguous") {
    const summaries = await buildOpenDraftSummaries(db);
    if (summaries.length === 0) {
      throw new ClarificationError("No open drafts to choose from.");
    }
    throw new ClarificationError(buildAmbiguousMessage(summaries), {
      draftOptions: summaries.map(formatDraftLabel),
    });
  }

  const latest = await getLatestOpenDraft(db);
  if (!latest) {
    if (operation === "list_open_drafts") {
      return { draftTarget, createNew: false };
    }
    throw new ClarificationError(
      "No open draft found. Start a new bill first.",
    );
  }

  return {
    billId: latest.billId,
    draftTarget,
    createNew: false,
  };
}

export function formatOpenDraftsSummaryForContext(
  summaries: OpenDraftSummary[],
): string {
  if (summaries.length === 0) {
    return "Open drafts: none";
  }
  const lines = summaries.map((s) => `- ${formatDraftLabel(s)}`);
  return `Open drafts (${summaries.length}):\n${lines.join("\n")}`;
}
