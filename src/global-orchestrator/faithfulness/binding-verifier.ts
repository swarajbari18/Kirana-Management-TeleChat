import type { GroundedResponse } from "../grounded-response/types.js";
import type {
  OutcomeRecord,
  VerifiedFactRecord,
} from "../verified-facts/types.js";
import { proseDetector } from "./prose-detector.js";
import { valuesMatch } from "./values-match.js";

export type BindingFailureReason =
  | "unbound_factual_line"
  | "unknown_factId"
  | "field_mismatch"
  | "value_mismatch"
  | "unknown_outcomeId"
  | "invalid_outcome_kind";

export interface BindingFailure {
  lineIndex: number;
  factId?: string;
  field?: string;
  expected?: string;
  asShown?: string;
  reason: BindingFailureReason;
}

export function verifyBindings(
  response: GroundedResponse,
  factRegistry: Map<string, VerifiedFactRecord>,
  outcomeRegistry: Map<string, OutcomeRecord>,
): BindingFailure[] {
  const failures: BindingFailure[] = [];

  response.lines.forEach((line, lineIndex) => {
    const bindings = line.bindings ?? [];
    const outcomeBindings = line.outcomeBindings ?? [];

    if (
      bindings.length === 0 &&
      outcomeBindings.length === 0 &&
      proseDetector(line.display)
    ) {
      failures.push({ lineIndex, reason: "unbound_factual_line" });
      return;
    }

    for (const binding of bindings) {
      const record = factRegistry.get(binding.factId);
      if (!record) {
        failures.push({
          lineIndex,
          factId: binding.factId,
          field: binding.field,
          asShown: binding.asShown,
          reason: "unknown_factId",
        });
        continue;
      }
      if (binding.field !== record.field) {
        failures.push({
          lineIndex,
          factId: binding.factId,
          field: binding.field,
          expected: record.field,
          asShown: binding.asShown,
          reason: "field_mismatch",
        });
        continue;
      }
      if (!valuesMatch(binding.asShown, record.value, record.valueType)) {
        failures.push({
          lineIndex,
          factId: binding.factId,
          field: binding.field,
          expected: record.value,
          asShown: binding.asShown,
          reason: "value_mismatch",
        });
      }
    }

    for (const outcomeBinding of outcomeBindings) {
      const outcome = outcomeRegistry.get(outcomeBinding.outcomeId);
      if (!outcome) {
        failures.push({
          lineIndex,
          factId: outcomeBinding.outcomeId,
          reason: "unknown_outcomeId",
        });
        continue;
      }
      if (outcomeBinding.kind !== outcome.kind) {
        failures.push({
          lineIndex,
          factId: outcomeBinding.outcomeId,
          reason: "invalid_outcome_kind",
        });
      }
    }
  });

  return failures;
}

export function countBindings(response: GroundedResponse): number {
  return response.lines.reduce(
    (sum, line) => sum + (line.bindings?.length ?? 0) + (line.outcomeBindings?.length ?? 0),
    0,
  );
}
