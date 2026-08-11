# Test matrix

| Requirement | Scenario | Evidence |
| --- | --- | --- |
| R1 | Valid/invalid config; unsupported package manager; named script discovery; missing required context file; unknown context entry | `tests/host-skill-adoption.test.ts` and `validateConfig`/`initHostSkillConfig` coverage |
| R2 | Mock exporter success; non-zero exit; timeout; credential-like output; oversized file; malformed catalog; temporary-output cleanup; no target mutation on failure | `tests/host-skill-adoption.test.ts` |
| R3 | Read-only check; first sync; generated update; unmarked conflict; invalid second target with first-target preservation; changed verify drift | `tests/host-skill-adoption.test.ts` |
| R4 | Initial supply; digest manifest; manifest tamper refusal; managed update guard; manual edit refusal; unmanaged target preservation | `tests/host-skill-adoption.test.ts` |
| R5 | Omitted/`propose`/`apply` policy, rendered workflow, registration-target preservation, invalid policy | `tests/host-material-skill-generator.test.ts` |
| R6 | Isolated scratch host with simulated online catalog, generated document validator, generated material validator, and no production network | `tests/host-skill-adoption.test.ts` plus forward run evidence |
