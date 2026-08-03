import type { StructuredCapabilityPlan } from "../types.js";
import type { ExecutionPhaseResult } from "../execution-engine/types.js";
import type {
  OutcomeRecord,
  VerifiedFactRecord,
} from "./types.js";
import {
  buildMspFactRecords,
  inferMspToolName,
} from "./msp-fact-registry.js";

export function buildRegistryFromPhaseResult(
  plan: StructuredCapabilityPlan,
  phaseResult: ExecutionPhaseResult,
): Map<string, VerifiedFactRecord> {
  const registry = new Map<string, VerifiedFactRecord>();

  const objectiveById = new Map(
    plan.objectives.map((step) => [step.objectiveId, step]),
  );

  for (const [objectiveId, entry] of Object.entries(phaseResult.objectives)) {
    if (entry.status !== "completed" || !entry.result) {
      continue;
    }
    const result = entry.result;
    if (result.status !== "completed") {
      continue;
    }

    const step = objectiveById.get(objectiveId);
    const capabilityId = step?.capabilityId ?? "unknown";
    const toolName = inferMspToolName(result.verifiedFacts);

    if (capabilityId === "my_shop_profile") {
      const records = buildMspFactRecords(
        objectiveId,
        capabilityId,
        toolName,
        result.verifiedFacts,
      );
      for (const record of records) {
        registry.set(record.factId, record);
      }
    }
  }

  return registry;
}

export function buildOutcomeCatalogFromPhaseResult(
  phaseResult: ExecutionPhaseResult,
): Map<string, OutcomeRecord> {
  const outcomes = new Map<string, OutcomeRecord>();

  for (const [objectiveId, entry] of Object.entries(phaseResult.objectives)) {
    if (entry.status !== "denied" || !entry.result) {
      continue;
    }
    const result = entry.result;
    if (result.status !== "denied") {
      continue;
    }
    const outcomeId = `deny_${objectiveId}`;
    outcomes.set(outcomeId, {
      outcomeId,
      objectiveId,
      kind: "denied",
      reason: result.reason,
      catalogLabel: `Denied (${objectiveId}): ${result.reason}`,
    });
  }

  return outcomes;
}

export function factsForDecision(registry: Map<string, VerifiedFactRecord>): unknown[] {
  return [...registry.values()].map((r) => ({
    factId: r.factId,
    field: r.field,
    value: r.value,
    catalogLabel: r.catalogLabel,
  }));
}
