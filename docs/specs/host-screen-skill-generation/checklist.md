# Acceptance checklist

- [x] Meta Skill frontmatter and `agents/openai.yaml` pass Skill validation.
- [x] Input bundle allowlist, strict fields, parser diagnostics, size limits, and sanitization declaration are tested.
- [x] Resource type `configSchema` and Dataset Descriptor parameter names are checked one-to-one.
- [x] Generated Skill output is deterministic and includes host guidelines, catalog references, schema, validator, and marker.
- [x] Initial generation refuses overwrite; guarded update stages, swaps, and rolls back safely.
- [x] Generated Skill supports creation and targeted revision instructions with literal parameters and empty variables/Blueprint rules.
- [x] Generated validator rejects unknown materials/resources/datasets/fields, bad schemas, unsupported capabilities, bad parents, variable parameters, and invalid bindings.
- [x] Generated validator reports layout warnings without hiding structural errors.
- [x] Generated validator resolves public parsers from installed host workspace packages through ESM `exports` entries, with a Base Screen checkout `dist` fallback.
- [x] Test matrix maps every requirement to automated evidence.
- [x] `pnpm verify:m0` passes, and no applicable task or checklist item remains unchecked.
