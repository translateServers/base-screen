# Test matrix

| Requirement | Scenario | Evidence |
| --- | --- | --- |
| R1 | Valid bundle; unknown field; unsafe path; credential-like guideline; framework/component route mismatch; dataset parameter authority; invalid sample | `tests/host-material-skill-generator.test.ts` plus public parser calls in `create-host-material-skill.mjs` |
| R2 | Stable output; selected route; generated files/marker; initial overwrite refusal; unmarked update refusal | `tests/host-material-skill-generator.test.ts` |
| R3 | Child workflow contains workspace marker, allowlisted roots, explicit registration, named verification scripts, failure preservation, and catalog refresh handoff | Generated `SKILL.md` assertions in `tests/host-material-skill-generator.test.ts`; isolated scratch workspace forward run passed the generated validator and both named scripts |
| R4 | New manifest passes public parser; duplicate type is rejected; contract references cover native/React/Vue, descriptor, event, and adapter boundary | Generated `scripts/validate-material-definition.mjs` integration in `tests/host-material-skill-generator.test.ts` |
