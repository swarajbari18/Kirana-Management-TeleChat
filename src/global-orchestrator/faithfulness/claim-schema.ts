export interface FactualClaim {
  text: string;
  entity: string;
  attribute: string;
  value: string;
}

export interface ClaimsPayload {
  claims: FactualClaim[];
}

const REQUIRED_KEYS = ["text", "entity", "attribute", "value"] as const;

export function validateClaimsPayload(
  payload: unknown,
): { valid: true; data: ClaimsPayload } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Payload must be an object"] };
  }

  const obj = payload as Record<string, unknown>;
  if (!("claims" in obj)) {
    return { valid: false, errors: ["Missing claims array"] };
  }

  if (!Array.isArray(obj.claims)) {
    return { valid: false, errors: ["claims must be an array"] };
  }

  for (let i = 0; i < obj.claims.length; i++) {
    const claim = obj.claims[i];
    if (!claim || typeof claim !== "object") {
      errors.push(`claims[${i}] must be an object`);
      continue;
    }
    const claimObj = claim as Record<string, unknown>;
    for (const key of Object.keys(claimObj)) {
      if (!REQUIRED_KEYS.includes(key as (typeof REQUIRED_KEYS)[number])) {
        errors.push(`claims[${i}] has invalid key: ${key}`);
      }
    }
    for (const key of REQUIRED_KEYS) {
      if (typeof claimObj[key] !== "string") {
        errors.push(`claims[${i}].${key} must be a string`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: obj as unknown as ClaimsPayload };
}
