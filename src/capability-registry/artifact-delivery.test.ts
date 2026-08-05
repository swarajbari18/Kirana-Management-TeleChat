import { describe, expect, it } from "vitest";
import {
  attachmentRefsFromRaw,
  sanitizeCapabilityResultForContext,
  sanitizePhaseResultForContext,
} from "./artifact-delivery.js";
import type { CapabilityResult } from "./types.js";

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

describe("artifact-delivery", () => {
  it("attachmentRefsFromRaw keeps metadata only", () => {
    const refs = attachmentRefsFromRaw([
      {
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        bytes: pdfBytes,
      },
    ]);
    expect(refs).toEqual([
      {
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        byteLength: 4,
      },
    ]);
    expect(refs[0]).not.toHaveProperty("bytes");
  });

  it("sanitizeCapabilityResultForContext strips legacy bytes", () => {
    const result = {
      status: "completed",
      verifiedFacts: { invoice_attached: true },
      attachments: [
        {
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          bytes: pdfBytes,
        },
      ],
    } as unknown as CapabilityResult;

    const sanitized = sanitizeCapabilityResultForContext(result);
    if (sanitized.status !== "completed") {
      throw new Error("expected completed");
    }
    expect(sanitized.attachments?.[0]).toEqual({
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      byteLength: 4,
    });
    expect(JSON.stringify(sanitized)).not.toContain("JVBER");
  });

  it("sanitizePhaseResultForContext strips bytes from objective results", () => {
    const sanitized = sanitizePhaseResultForContext({
      objectives: {
        o1: {
          status: "completed",
          result: {
            status: "completed",
            verifiedFacts: {},
            attachments: [
              {
                filename: "invoice.pdf",
                mimeType: "application/pdf",
                bytes: pdfBytes,
              },
            ],
          } as unknown as CapabilityResult,
        },
      },
    });
    const attachment = sanitized.objectives.o1?.result;
    if (!attachment || attachment.status !== "completed") {
      throw new Error("expected completed objective");
    }
    expect(attachment.attachments?.[0]).toEqual({
      filename: "invoice.pdf",
      mimeType: "application/pdf",
      byteLength: 4,
    });
  });
});
