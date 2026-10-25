---
name: create-base-screen-host-skill
description: Generate or refresh a host-specific Codex Skill for designing Base Screen dashboards from a canonical host snapshot, with optional online material MCP discovery/validation and explicit offline fallback. Use when a host needs a reusable Skill that produces or revises importable Screen Documents using its own sanitized material, data, sample, and brand catalog.
---

# Create a host-specific dashboard Skill

Use this Skill to turn the host-owned, canonical single-file snapshot into a focused Skill that another model can use to design large-screen dashboards.

## Workflow

1. Ask for or locate the canonical snapshot file `.base-screen/host-snapshot.json` containing `host`, `screenGuidelines`, `materials`, `resourceTypes`, `datasets`, and optionally `datasetSamples` and `materialProvenance`. Read [input-bundle.md](references/input-bundle.md) before accepting a snapshot.
2. Choose an output parent. Default to `$CODEX_HOME/skills`, or `~/.codex/skills` when `CODEX_HOME` is unset. Derive the child Skill name as `design-<hostId>-screens`.
3. Run `scripts/create-host-screen-skill.mjs --input <snapshot.json> --check` first. Stop on any diagnostic; do not invent missing material, resource, parameter, field, or brand metadata.
4. Generate the child Skill with `scripts/create-host-screen-skill.mjs --input <snapshot.json> --output <parent>`. Use `--update` only when an existing target contains the generator marker for the same host.
5. Run the generated Skill's `scripts/validate-screen-document.mjs` against a fixture document before handing the Skill to the host. If the host has Base Screen packages available, use their public parsers and semantic validators; do not copy or bypass contract logic.

## Generated Skill contract

The child Skill must instruct the model to:

- Read the host guidelines first, then selectively inspect matching materials, resource types, datasets, and samples.
- Create a complete Screen Document for a new request or preserve existing component identities while revising an existing document.
- Use only catalog identities and literal resource parameters. Keep `variables` and `blueprint.rules` empty in this scope.
- Use samples only to infer layout, chart/table choice, value ranges, and text lengths; do not embed sample rows unless the user explicitly requests static content.
- Run the generated validator until it reports no errors, then return the document path and a concise design summary.
- Fail closed on unknown material types, resource identities, parameters, fields, unsupported data capabilities, invalid props/style, or invalid parent relationships.

The generated Skill never connects to a host port, queries live data, or stores credentials, SQL, headers, tokens, or service objects in a Screen Document. Image sources prefer `host-resource` identities; never write signed or temporary URLs. A stable external image URL is allowed only for `base.image` static data or `canvas.backgroundImage` (ADR-0089).

## Resources

- [input-bundle.md](references/input-bundle.md) defines the canonical snapshot shape, limits, and safety rules.
- [host-skill-template](./assets/host-skill-template/) contains the child Skill template and document validator.
- `scripts/create-host-screen-skill.mjs` performs strict validation, deterministic rendering, and guarded atomic updates.
