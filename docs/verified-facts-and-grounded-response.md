# Verified Facts and Grounded Response

Authoritative contract for capability/tool authors and the C4.1 faithfulness path.

## Purpose

Component 4 used **NL claim extraction** after response generation. That failed in production ([agent trace.csv](../agent%20trace.csv)): correct responses were rejected because the extractor used wrong attribute names (`name` vs `shopName`) and boolean normalization (`Yes` vs `true`).

**C4.1 replaces extraction with grounded response:**

1. Response LLM outputs JSON with **bindings** at write time (`factId`, `field`, `asShown`).
2. Code verifies bindings against the **Verified Fact Registry** (tool-sourced).
3. No LLM on the verification path.

Never verify natural language with natural language.

## Tool author checklist

When designing a new tool or capability:

1. **Return structured `verifiedFacts`** — every citeable field must be addressable via `jsonPath`.
2. **Register a fact builder** in `verified-facts/{capability}-fact-registry.ts`.
3. **One `VerifiedFactRecord` per atomic citeable fact** — inventory: per `(sku, field)`, not one blob.
4. **`catalogLabel` must disambiguate identity** — include SKU/canonical name so Response picks the correct `factId`.
5. **Set `identity.sku` / `identity.canonicalName`** for multi-entity domains.
6. **Set `valueType` correctly** — drives `valuesMatch` (string, boolean, number, json).
7. **Do not put non-truth in `verifiedFacts`** — `denied` / `clarification_needed` → Outcome Catalog.
8. **Add BV/INV unit fixtures** when adding a capability.

## jsonPath conventions

| Pattern | Example |
|---------|---------|
| Scalar | `shopName`, `gstin` |
| Array item | `items[sku=MAG-001].quantity` |
| Nested | `customer.balance.current` |

## factId pattern

`{capabilityId}_{objectiveId}_{toolName}_{field}`

Example: `user_profile_fetch_shop_profile_read_shop_profile_gstin`

## GroundedResponse schema

```json
{
  "lines": [
    {
      "display": "GSTIN: 27AAPFU0939F1ZV",
      "bindings": [
        {
          "factId": "user_profile_fetch_shop_profile_read_shop_profile_gstin",
          "field": "gstin",
          "asShown": "27AAPFU0939F1ZV"
        }
      ]
    }
  ]
}
```

- **User delivery:** `lines.map(l => l.display).join("\n")` — bindings never sent to Telegram.
- **Denied writes:** use `outcomeBindings` with `outcomeId` from Outcome Catalog.

## Verifier pipeline (code only)

1. Schema validate `GroundedResponse` (`MAX_GROUNDED_RESPONSE_SCHEMA_RETRIES`)
2. `verifyBindings` per line (BV-* catalog)
3. On failure → regen with diagnostics (`MAX_FAITHFULNESS_REGEN`)
4. Exhausted → `FAITHFULNESS_SAFE_FALLBACK`

**Removed:** `FAITHFULNESS_EXTRACT`, claim extractor LLM, `fact-matcher`.

## Business intent (Planning)

Planning JSON includes top-level `businessIntent` — separate from `objectiveDescription`. Decision Mode uses plan `businessIntent`, not the first objective text.

## What requires re-engineering

| Component | Action |
|-----------|--------|
| MSP tools | Registry builder only — output shape OK |
| Inventory (C5.1) | `inventory-fact-registry.ts` — per `(sku, field)`; tools: `query_inventory`, `register_inventory`, `update_inventory`, `allocate_inventory` |
| C4 claim extractor | **Removed** |
| `accumulateVerifiedFacts` flat mapping | **Removed** — use `VerifiedFactRecord` registry |

## Appendix — G4 spike

Run: `npm test -- src/integration/grounded-response-production.integration.test.ts`

Requires `GEMINI_API_KEY`. Confirms real Gemini returns valid `GroundedResponse` that passes `verifyBindings` against fixture MSP catalog.
