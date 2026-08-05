import type { VerifiedFactValueType } from "../verified-facts/types.js";

export function valuesMatch(
  asShown: string,
  factValue: string,
  valueType: VerifiedFactValueType,
): boolean {
  switch (valueType) {
    case "boolean": {
      const shown = normalizeBoolean(asShown);
      const fact = normalizeBoolean(factValue);
      return shown === fact;
    }
    case "number": {
      const stripped = asShown.replace(/,/g, "").trim();
      const factNum = Number.parseFloat(factValue);
      if (stripped.startsWith("₹")) {
        const rupees = Number.parseFloat(stripped.slice(1));
        if (
          !Number.isNaN(rupees) &&
          !Number.isNaN(factNum) &&
          Math.round(rupees * 100) === factNum
        ) {
          return true;
        }
      }
      const shownNum = Number.parseFloat(stripped);
      if (Number.isNaN(shownNum) || Number.isNaN(factNum)) {
        return false;
      }
      return shownNum === factNum;
    }
    case "json": {
      try {
        return (
          JSON.stringify(JSON.parse(asShown)) ===
          JSON.stringify(JSON.parse(factValue))
        );
      } catch {
        return canonicalJson(asShown) === canonicalJson(factValue);
      }
    }
    default:
      return normalizeString(asShown) === normalizeString(factValue);
  }
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

function canonicalJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value.trim();
  }
}
