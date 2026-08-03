export interface LineBinding {
  factId: string;
  field: string;
  asShown: string;
}

export interface OutcomeBinding {
  outcomeId: string;
  kind: "denied";
}

export interface GroundedResponseLine {
  display: string;
  bindings?: LineBinding[];
  outcomeBindings?: OutcomeBinding[];
}

export interface GroundedResponse {
  lines: GroundedResponseLine[];
}

export function groundedResponseToDisplayText(response: GroundedResponse): string {
  return response.lines.map((line) => line.display).join("\n");
}
