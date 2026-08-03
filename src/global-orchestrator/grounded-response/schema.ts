import type { GroundedResponse } from "./types.js";

export function validateGroundedResponse(
  payload: unknown,
): { valid: true; data: GroundedResponse } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Payload must be an object"] };
  }

  const obj = payload as Record<string, unknown>;
  if (!Array.isArray(obj.lines)) {
    return { valid: false, errors: ["lines must be an array"] };
  }

  for (let i = 0; i < obj.lines.length; i++) {
    const line = obj.lines[i];
    if (!line || typeof line !== "object") {
      errors.push(`lines[${i}] must be an object`);
      continue;
    }
    const lineObj = line as Record<string, unknown>;
    if (typeof lineObj.display !== "string" || lineObj.display.trim().length === 0) {
      errors.push(`lines[${i}].display must be a non-empty string`);
    }

    if (lineObj.bindings !== undefined) {
      if (!Array.isArray(lineObj.bindings)) {
        errors.push(`lines[${i}].bindings must be an array`);
      } else {
        for (let j = 0; j < lineObj.bindings.length; j++) {
          const binding = lineObj.bindings[j] as Record<string, unknown>;
          if (typeof binding.factId !== "string") {
            errors.push(`lines[${i}].bindings[${j}].factId must be a string`);
          }
          if (typeof binding.field !== "string") {
            errors.push(`lines[${i}].bindings[${j}].field must be a string`);
          }
          if (typeof binding.asShown !== "string") {
            errors.push(`lines[${i}].bindings[${j}].asShown must be a string`);
          }
        }
      }
    }

    if (lineObj.outcomeBindings !== undefined) {
      if (!Array.isArray(lineObj.outcomeBindings)) {
        errors.push(`lines[${i}].outcomeBindings must be an array`);
      } else {
        for (let j = 0; j < lineObj.outcomeBindings.length; j++) {
          const ob = lineObj.outcomeBindings[j] as Record<string, unknown>;
          if (typeof ob.outcomeId !== "string") {
            errors.push(`lines[${i}].outcomeBindings[${j}].outcomeId must be a string`);
          }
          if (ob.kind !== "denied") {
            errors.push(`lines[${i}].outcomeBindings[${j}].kind must be "denied"`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: obj as unknown as GroundedResponse };
}
