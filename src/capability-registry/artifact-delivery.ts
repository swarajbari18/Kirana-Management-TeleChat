import type { OutboundAttachment } from "../worker-telegram-adapter/contracts/index.js";
import type { ExecutionPhaseResult } from "../global-orchestrator/execution-engine/types.js";
import type {
  CapabilityAttachmentRef,
  CapabilityResult,
} from "./types.js";

export interface RawArtifactAttachment {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export function attachmentRefsFromRaw(
  raw: RawArtifactAttachment[],
): CapabilityAttachmentRef[] {
  return raw.map(({ filename, mimeType, bytes }) => ({
    filename,
    mimeType,
    byteLength: bytes.byteLength,
  }));
}

export function rawAttachmentsToOutbound(
  raw: RawArtifactAttachment[],
): OutboundAttachment[] {
  return raw.map((attachment) => ({
    type: "document" as const,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    data: attachment.bytes.buffer.slice(
      attachment.bytes.byteOffset,
      attachment.bytes.byteOffset + attachment.bytes.byteLength,
    ) as ArrayBuffer,
  }));
}

/** Strip artifact bytes — metadata only for agent state and LLM context. */
export function sanitizeCapabilityResultForContext(
  result: CapabilityResult,
): CapabilityResult {
  if (result.status !== "completed" || !result.attachments?.length) {
    return result;
  }
  return {
    ...result,
    attachments: result.attachments.map((attachment) => {
      if ("byteLength" in attachment) {
        return attachment;
      }
      const withBytes = attachment as RawArtifactAttachment;
      return {
        filename: withBytes.filename,
        mimeType: withBytes.mimeType,
        byteLength: withBytes.bytes.byteLength,
      };
    }),
  };
}

export function sanitizePhaseResultForContext(
  phaseResult: ExecutionPhaseResult,
): ExecutionPhaseResult {
  return {
    objectives: Object.fromEntries(
      Object.entries(phaseResult.objectives).map(([objectiveId, entry]) => [
        objectiveId,
        entry.result
          ? {
              ...entry,
              result: sanitizeCapabilityResultForContext(entry.result),
            }
          : entry,
      ]),
    ),
  };
}

export interface ArtifactDeliveryBuffer {
  stageDeliveryAttachments(
    raw: RawArtifactAttachment[],
  ): CapabilityAttachmentRef[] | undefined;
}

export function stageCapabilityAttachments(
  delivery: ArtifactDeliveryBuffer | undefined,
  raw: RawArtifactAttachment[],
): CapabilityAttachmentRef[] | undefined {
  if (raw.length === 0) {
    return undefined;
  }
  return delivery?.stageDeliveryAttachments(raw);
}
