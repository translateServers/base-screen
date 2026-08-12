# Test matrix

| Requirement | Scenario | Evidence |
| --- | --- | --- |
| R1 | Valid/invalid config incl. optional `credentialEnvVars`; unsupported package manager; named script discovery; snapshot object with unknown/missing fields; credential-like value; executable content; remote URL; oversized snapshot | `tests/host-skill-adoption.test.ts` (`validateConfig`, snapshot validation) |
| R1 | Canonical sorting, repeated-sync stability, `.base-screen/host-snapshot.json` commit, identical `snapshotDigest` in both manifests | `tests/host-skill-adoption.test.ts` and generator tests |
| R1 | Optional guarded material templates, old-snapshot compatibility, stable `catalogDigest` in both manifests | `tests/host-material-mcp.test.ts` and generator tests |
| R2 | Mock exporter success; non-zero exit; timeout; malformed snapshot; no target mutation on failure | `tests/host-skill-adoption.test.ts` |
| R3 | Default sync; offline `verify` detects missing/extra/changed files and digest mismatch; `check-remote` reports drift without writing; `doctor` reports each check | `tests/host-skill-adoption.test.ts` |
| R4 | First install, repeated install, managed upgrade; digest manifest; manual-edit refusal; unmanaged target preservation; legacy migration with matching digests; manual-change migration refusal; package script registration and conflict | `tests/host-skill-adoption.test.ts` |
| R4 | Toolkit installed under `.base-screen/tooling/base-screen-host-skills/**`; `.agents/skills` holds only the two business Skills | `tests/host-skill-adoption.test.ts` |
| R5 | Omitted/`propose`/`apply` policy, rendered workflow, registration-target preservation, invalid policy | `tests/host-material-skill-generator.test.ts` |
| R6 | Isolated scratch host with simulated online catalog, generated document validator, generated material validator, and no production network | `tests/host-skill-adoption.test.ts` plus forward run evidence |
| R7 | Optional provenance routing and standalone request/candidate/catalog validation | `tests/material-handoff.test.ts` and generated tooling checks |
| R8 | One-command setup: preflight failure and apply failure each restore toolkit, config, canonical snapshot, and both Skills | `tests/host-skill-adoption.test.ts` |
| Docs | Five manuals complete; quick-start alone enables install, first sync, verify, and one update | Manual review in `docs/host-skill-manuals/` |
