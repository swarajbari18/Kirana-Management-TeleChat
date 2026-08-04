export class ArtifactRenderError extends Error {
  readonly code: "pdf_render_failed" | "pptx_render_failed";

  constructor(
    code: "pdf_render_failed" | "pptx_render_failed",
    message: string,
  ) {
    super(message);
    this.name = "ArtifactRenderError";
    this.code = code;
  }
}
