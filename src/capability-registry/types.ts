/** Artifact metadata for agent state / LLM context — never raw bytes. */
export interface CapabilityAttachmentRef {
  filename: string;
  mimeType: string;
  byteLength: number;
}

export type CapabilityResult =
  | {
      status: "completed";
      verifiedFacts: Record<string, unknown>;
      refusalMessage?: string;
      attachments?: CapabilityAttachmentRef[];
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
