import type { ToolPlanStep } from "../types.js";
import type {
  OperationDiscriminatedContract,
  ParamFieldSpec,
  ParamValidationResult,
  ToolContractEntry,
  ToolParamContract,
} from "./types.js";

function isFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed);
  }
  return false;
}

function checkFieldType(
  field: ParamFieldSpec,
  value: unknown,
  toolLabel: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  switch (field.kind) {
    case "string": {
      if (typeof value !== "string" || value.length === 0) {
        return `${toolLabel}: parameter "${field.name}" must be a non-empty string`;
      }
      return null;
    }
    case "number": {
      if (!isFiniteNumber(value)) {
        return `${toolLabel}: parameter "${field.name}" must be a finite number`;
      }
      return null;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return `${toolLabel}: parameter "${field.name}" must be a boolean`;
      }
      return null;
    }
    case "string[]": {
      if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === "string")
      ) {
        return `${toolLabel}: parameter "${field.name}" must be an array of strings`;
      }
      return null;
    }
    case "enum": {
      const str = String(value);
      if (!field.enumValues?.includes(str)) {
        return `${toolLabel}: parameter "${field.name}" must be one of: ${field.enumValues?.join(", ")}`;
      }
      return null;
    }
    default:
      return null;
  }
}

function allowedFieldNames(contract: ToolParamContract): Set<string> {
  return new Set(contract.fields.map((f) => f.name));
}

function validateAgainstContract(
  toolLabel: string,
  params: Record<string, unknown>,
  contract: ToolParamContract,
): ParamValidationResult {
  const diagnostics: string[] = [];
  const allowed = allowedFieldNames(contract);

  for (const key of Object.keys(params)) {
    if (!allowed.has(key)) {
      const allowedList = [...allowed].sort().join(", ") || "(none)";
      diagnostics.push(
        `${toolLabel}: unknown parameter "${key}" (allowed: ${allowedList})`,
      );
    }
  }

  if (diagnostics.length > 0) {
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  for (const field of contract.fields) {
    const value = params[field.name];
    if (field.required && (value === undefined || value === null)) {
      diagnostics.push(
        `${toolLabel}: missing required parameter "${field.name}"`,
      );
      continue;
    }
    const typeError = checkFieldType(field, value, toolLabel);
    if (typeError) {
      diagnostics.push(typeError);
    }
  }

  if (contract.requireOneOf?.length) {
    const hasOne = contract.requireOneOf.some(
      (name) => params[name] !== undefined && params[name] !== null,
    );
    if (!hasOne) {
      diagnostics.push(
        `${toolLabel}: at least one of [${contract.requireOneOf.join(", ")}] is required`,
      );
    }
  }

  if (diagnostics.length > 0) {
    return { valid: false, reason: diagnostics[0], diagnostics };
  }

  return { valid: true };
}

function mergeContracts(
  sharedFields: readonly ParamFieldSpec[] | undefined,
  operationContract: ToolParamContract,
): ToolParamContract {
  const sharedNames = new Set((sharedFields ?? []).map((f) => f.name));
  const opFields = operationContract.fields.filter(
    (f) => !sharedNames.has(f.name),
  );
  return {
    fields: [...(sharedFields ?? []), ...opFields],
    requireOneOf: operationContract.requireOneOf,
  };
}

function resolveOperationContract(
  toolLabel: string,
  params: Record<string, unknown>,
  discriminated: OperationDiscriminatedContract,
): ParamValidationResult | ToolParamContract {
  const opParam = discriminated.operationParam;
  const operation = params[opParam];

  if (operation === undefined || operation === null) {
    return {
      valid: false,
      reason: `${toolLabel}: missing required parameter "${opParam}"`,
      diagnostics: [`${toolLabel}: missing required parameter "${opParam}"`],
    };
  }

  const operationStr = String(operation);
  if (!discriminated.operationEnumValues.includes(operationStr)) {
    return {
      valid: false,
      reason: `${toolLabel}: invalid ${opParam} "${operationStr}"`,
      diagnostics: [
        `${toolLabel}: ${opParam} must be one of: ${discriminated.operationEnumValues.join(", ")}`,
      ],
    };
  }

  const slice = discriminated.byOperation[operationStr];
  if (!slice) {
    return {
      valid: false,
      reason: `${toolLabel}: no parameter contract for operation "${operationStr}"`,
      diagnostics: [
        `${toolLabel}: no parameter contract for operation "${operationStr}"`,
      ],
    };
  }

  return mergeContracts(discriminated.sharedFields, slice);
}

export function validateStepParameters(
  toolLabel: string,
  params: Record<string, unknown>,
  entry: ToolContractEntry,
): ParamValidationResult {
  if (entry.kind === "flat") {
    return validateAgainstContract(toolLabel, params, entry.contract);
  }

  const resolved = resolveOperationContract(toolLabel, params, entry.contract);
  if ("valid" in resolved) {
    return resolved;
  }

  return validateAgainstContract(toolLabel, params, resolved);
}

export function validateToolParameters(
  capabilityId: string,
  step: ToolPlanStep,
  getContract: (capabilityId: string, toolName: string) => ToolContractEntry | undefined,
): ParamValidationResult {
  const entry = getContract(capabilityId, step.toolName);
  if (!entry) {
    return { valid: true };
  }

  const toolLabel = `${capabilityId}.${step.toolName}`;
  const params = step.parameters ?? {};
  return validateStepParameters(toolLabel, params, entry);
}
