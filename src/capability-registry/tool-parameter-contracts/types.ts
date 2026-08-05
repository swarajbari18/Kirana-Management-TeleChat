export type ParamKind = "string" | "number" | "boolean" | "string[]" | "enum";

export interface ParamFieldSpec {
  name: string;
  kind: ParamKind;
  required?: boolean;
  enumValues?: readonly string[];
}

export interface ToolParamContract {
  fields: readonly ParamFieldSpec[];
  requireOneOf?: readonly string[];
}

export interface OperationDiscriminatedContract {
  operationParam: string;
  operationEnumValues: readonly string[];
  byOperation: Record<string, ToolParamContract>;
  sharedFields?: readonly ParamFieldSpec[];
}

export type ToolContractEntry =
  | { kind: "flat"; contract: ToolParamContract }
  | { kind: "operation"; contract: OperationDiscriminatedContract };

export interface ParamValidationResult {
  valid: boolean;
  reason?: string;
  diagnostics?: string[];
}
