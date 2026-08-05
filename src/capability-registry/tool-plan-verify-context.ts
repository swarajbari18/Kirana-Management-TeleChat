/** Prior query_inventory agent state from an earlier BC invocation in the same GO run. */
export interface PriorBcQueryState {
  productName?: string;
  agentState: Record<string, unknown>;
}

export interface ToolPlanVerifyContext {
  capabilityId: string;
  priorQueryAgentStates: PriorBcQueryState[];
}
