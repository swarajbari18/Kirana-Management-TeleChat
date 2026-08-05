import type { ToolPlanStep } from "./types.js";

/** Evidence available when validating BC tool parameters against owner intent. */
export interface ParameterGroundingContext {
  objectiveDescription: string;
  userMessage: string;
  priorObjectiveResults?: Record<string, Record<string, unknown>>;
}

export interface ParameterGroundingResult {
  valid: boolean;
  diagnostic?: string;
  userMessage?: string;
}
