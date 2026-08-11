# Test matrix

| Requirement | Scenario | Evidence |
| --- | --- | --- |
| R1 | Valid bundle; unknown file/field; malformed manifest/resource/dataset; descriptor schema mismatch; invalid sample | `tests/host-screen-skill-generator.test.ts` |
| R2 | Stable output for repeated generation; generated Skill structure and metadata | `tests/host-screen-skill-generator.test.ts` + `quick_validate.py` |
| R3 | Existing unmarked directory; generated update; replacement failure and rollback | `tests/host-screen-skill-generator.test.ts` |
| R4 | Generated instructions and valid new/revision documents | Generated Skill forward tests: new dashboard and targeted revision |
| R5 | Valid document; unknown catalog identities; props/style; parent capability; literal params; binding roles; out-of-bounds warning | Generated `validate-screen-document.mjs` integration tests |
