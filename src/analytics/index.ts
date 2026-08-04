import type { BusinessObjective } from "../capability-registry/index.js";
import type { OrchestrationContext } from "../global-orchestrator/types.js";
import type { RuntimePorts } from "../store-durable-object/runtime-ports/types.js";
import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import type { CapabilityResult } from "../capability-registry/types.js";
import {
  analyticsTracePayload,
  generateAnalytics,
} from "./generate-analytics.js";

export const ANALYTICS_TOOL_SURFACE = ["generate_analytics"];

export async function executeAnalytics(
  objective: BusinessObjective,
  ctx: OrchestrationContext,
  _runtimePorts: RuntimePorts,
  db: StoreDatabase,
  runContext?: import("../store-durable-object/agent-state/run-context.js").RunContext,
  parentEventId?: string,
): Promise<CapabilityResult> {
  void objective;
  void ctx;

  const { result, snapshot } = await generateAnalytics(db);

  if (runContext) {
    const attachmentFilename =
      result.status === "completed"
        ? (result.attachments?.[0]?.filename ?? "")
        : "";
    await runContext.appendTrace(
      "capability",
      "analytics",
      "ANALYTICS_GENERATED",
      snapshot
        ? analyticsTracePayload(snapshot, attachmentFilename, false)
        : {
            generatedAtIso: new Date().toISOString(),
            emptyShop: true,
            attachmentFilename: null,
          },
      parentEventId,
    );
  }

  return result;
}
