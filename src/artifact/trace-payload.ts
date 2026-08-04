import type { ArtifactGeneratedTracePayload } from "./types.js";

export function artifactGeneratedPayload(
  input: ArtifactGeneratedTracePayload,
): Record<string, unknown> {
  return {
    kind: input.kind,
    filename: input.filename,
    byteLength: input.byteLength,
    mimeType: input.mimeType,
  };
}

export function artifactDeliveredPayload(input: {
  filename: string;
  mimeType: string;
}): Record<string, unknown> {
  return {
    filename: input.filename,
    mimeType: input.mimeType,
  };
}
