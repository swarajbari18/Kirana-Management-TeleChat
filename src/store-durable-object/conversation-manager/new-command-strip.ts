export function stripNewCommand(text: string): string {
  return text.replace(/^\/new(?:@\S+)?\s*/i, "").trim();
}
