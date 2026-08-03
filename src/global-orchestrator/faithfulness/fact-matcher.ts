import type { CanonicalFact } from "../../store-durable-object/agent-state/run-context.js";
import type { FactualClaim } from "./claim-schema.js";

const ATTRIBUTE_ALIASES: Record<string, string[]> = {
  shop_name: ["shop_name", "shopname", "name"],
  owner_name: ["owner_name", "ownername", "owner"],
  gstin: ["gstin", "gst_in", "gst"],
  gst_registered: ["gst_registered", "gstregistered", "registered"],
  instructions: ["instructions", "instruction"],
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findMatchingFact(
  claim: FactualClaim,
  facts: CanonicalFact[],
): CanonicalFact | undefined {
  const aliases = ATTRIBUTE_ALIASES[claim.attribute] ?? [claim.attribute];

  return facts.find(
    (f) =>
      f.entity === claim.entity &&
      aliases.includes(f.attribute) &&
      normalize(f.value) === normalize(claim.value),
  );
}

export function findUnsupportedClaims(
  claims: FactualClaim[],
  facts: CanonicalFact[],
): FactualClaim[] {
  if (claims.length === 0) {
    return [];
  }

  const unsupported: FactualClaim[] = [];

  for (const claim of claims) {
    const aliases = ATTRIBUTE_ALIASES[claim.attribute];
    if (!aliases) {
      unsupported.push(claim);
      continue;
    }

    const entityFacts = facts.filter((f) => f.entity === claim.entity);
    if (entityFacts.length === 0) {
      unsupported.push(claim);
      continue;
    }

    const match = findMatchingFact(claim, facts);
    if (!match) {
      unsupported.push(claim);
    }
  }

  return unsupported;
}
