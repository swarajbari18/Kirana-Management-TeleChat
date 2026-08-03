# Scenarios for Query Matrix (Component 4)

Future full query matrix conversation — do not edit `queries.csv` in C4.

## Multi-objective execution

- Independent clarification + completed sibling in one execution phase → Decision `clarify` → aggregated Response Mode message
- Dependent objectives skipped when upstream returns `clarification_needed` or `denied`

## Strategic replan

- Read profile in round 1 → Decision `replan` → update in round 2 with prior plan + results + Decision rationale in Planning context
- BC re-invoke receives prior tool plan + prior results (not full GO trace)

## Faithfulness

- Verbose respond path triggers claim extraction → matcher → regen cap → safe fallback
- Clarify path skips faithfulness matcher

## Parameter grounding

- Harness retry chain: structural verify pass → grounding fail → replan with diagnostic → success or `clarification_needed`

## Profile history

- Sequential GST confirm + identity update → one history row per changed field per applied write
- Denied confirmation → no history row; profile unchanged

## Stress / future

- Ten-objective DAG (O1–O3 independent, O4–O6 depend on O1–O3, etc.)
- Multi-capability planning (post-C6 Inventory)
- `complete_autonomy` direct write path with history
