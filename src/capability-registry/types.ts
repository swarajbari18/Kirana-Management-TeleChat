export type CapabilityResult =
  | {
      status: "completed";
      verifiedFacts: Record<string, unknown>;
      refusalMessage?: string;
      attachments?: Array<{
        filename: string;
        mimeType: string;
        bytes: Uint8Array;
      }>;
    }
  | { status: "clarification_needed"; reason: string; requiredInfo: string }
  | { status: "denied"; reason: "user_rejected" | "not_confirmed" | "timeout" }
  | { status: "not_supported"; reason: string }
  | { status: "unavailable"; capabilityId: string; reason: string }
  | { status: "error"; diagnostics: string };

export interface ToolPlanStep {
  operationId: string;
  operationDescription: string;
  toolName: string;
  parameters: Record<string, unknown>;
  rationale?: string;
  dependencies: string[];
}

export interface StructuredToolPlan {
  operations: ToolPlanStep[];
}
