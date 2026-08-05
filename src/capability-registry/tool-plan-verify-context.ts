/** Prior read-tool agent state from an earlier BC invocation in the same GO run. */
export interface PriorBcQueryState {
  queryTool: "query_inventory" | "query_khata";
  productName?: string;
  customerName?: string;
  agentState: Record<string, unknown>;
}

export interface ToolPlanVerifyContext {
  capabilityId: string;
  priorQueryAgentStates: PriorBcQueryState[];
}
