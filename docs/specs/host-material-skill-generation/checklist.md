# Acceptance checklist

- [x] Meta Skill frontmatter and `agents/openai.yaml` pass Skill validation (`quick_validate.py`).
- [x] Bundle allowlist, strict fields, safe path policy, framework/registration rules, parser diagnostics, size limits, and sanitization checks are implemented and tested.
- [x] Resource type `configSchema` and Dataset Descriptor parameter names are checked one-to-one.
- [x] Generated Skill output is deterministic and includes host rules, one framework route, workspace policy, catalog references, public contract, validator, and marker.
- [x] Initial generation refuses overwrite and guarded update refuses unmarked directories.
- [x] Generated Skill supports creation and targeted revision instructions, explicit registration, verification scripts, diff auditing, and catalog refresh handoff.
- [x] Generated validator rejects invalid manifests and existing catalog type conflicts through public parsers.
- [x] Native, React, and Vue route references state the current adapter and event boundaries.
- [x] Test matrix maps every requirement to automated evidence.
- [x] Relevant focused tests and quality checks pass: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (821 tests), `pnpm build`, `pnpm check:packages`, `pnpm check:boundaries`, `pnpm check:api`, `pnpm check:engine-import`, and `pnpm verify:tarball`; no applicable task or checklist item remains unchecked.
