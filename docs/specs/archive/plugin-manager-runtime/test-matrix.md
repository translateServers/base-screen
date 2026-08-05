# Plugin Manager Runtime Test Matrix

| Requirement | Automated evidence |
| --- | --- |
| R1 | `manager.test.ts` create-without-side-effects; `testing/plugin-manager.test.ts`; `verify-tarballs.mjs` Manager smoke consumer |
| R2 | `manager.test.ts` preflight cycle, malformed manifest and missing dependency cases; `preflight.test.ts` duplicate identity and contribution conflict cases |
| R3 | `manager.test.ts` deterministic dependency activation and candidate permutation cases |
| R4 | `manager.test.ts` changing tag constructor case; `verify-browser-harness.mjs` real `CustomElementRegistry.get()` case |
| R5 | `preflight.test.ts` unapproved capability case; `manager.test.ts` frozen granted capability and unsupported Blueprint capability cases |
| R6 | `manager.test.ts` activation failure rollback and session invalidation case |
| R7 | `manager.test.ts` atomic Catalog publish and contribution-summary cases |
| R8 | `manager.test.ts` rollback session invalidation, failed deactivate, shared dispose and reactivation disposal cases; `testing/plugin-manager.test.ts` lifecycle conformance |
| R9 | `manager.test.ts` isolated Manager sessions and Catalogs case |
| R10 | `manager.test.ts` canary lifecycle error normalization case |

Quality evidence: `pnpm verify:browser`, `pnpm check:api`, `pnpm verify:tarball`, and `pnpm verify:m0`.
