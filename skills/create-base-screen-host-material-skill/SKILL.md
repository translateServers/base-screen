---
name: create-base-screen-host-material-skill
description: Generate or refresh a host-specific Codex Skill that creates or proposes registration for Base Screen materials in a host workspace from a canonical host snapshot of sanitized catalogs, framework rules, component references, and data-resource descriptors. Use when a host needs a reusable Skill for authoring native, React, or Vue materials with guarded source paths, public ABI validation, tests, and explicit registration policy.
---

# Create a host-specific material Skill

Use this Skill to turn the host-owned, canonical single-file snapshot into a focused child Skill
named `create-<hostId>-material`. The child Skill helps another model create or update one material
in the host's Git workspace. It does not publish, commit, activate production code, install
dependencies, or connect to live services.

## Workflow

1. Ask for or locate the canonical snapshot file `.base-screen/host-snapshot.json` containing
   `host`, `materialAuthoring`, `materialGuidelines`, `components`, `materials`, `resourceTypes`,
   and `datasets`; `datasetSamples` and `materialProvenance` are optional. Read
   [input-bundle.md](references/input-bundle.md) before accepting it.
2. Choose an output parent. Default to `$CODEX_HOME/skills`, or `~/.codex/skills` when `CODEX_HOME`
   is unset. Derive the child Skill name as `create-<hostId>-material`.
3. Run `scripts/create-host-material-skill.mjs --input <snapshot.json> --check` first. Stop on any
   diagnostic; never invent a workspace path, framework, registration file, component reference, or
   catalog identity.
4. Generate with `scripts/create-host-material-skill.mjs --input <snapshot.json> --output <parent>`.
   Use `--update` only when an existing target contains the matching generator marker.
5. Run the generated Skill's `scripts/validate-material-definition.mjs` against a representative
   manifest and run the host's named verification scripts before handing the Skill to the host.

## Generated Skill contract

The child Skill must instruct the model to:

- Verify the requested Git workspace against the host marker and use only the configured source,
  test, reference, and registration paths.
- Read the host rules, selected framework route, public material contract, existing catalog, data
  resources, datasets, and matching component references before editing.
- Create or revise a complete material manifest and implementation using the selected native, React,
  or Vue public bridge. Keep `type` and `tagName` stable on revisions and use a host namespace for new
  identities.
- Validate the manifest, props/style defaults, editor descriptor, data-binding roles, event payloads,
  and optional tabular adapter through the public parsers before source edits are registered.
- Add focused tests and update only the explicitly allowed standalone or plugin registration file.
  Registration must be explicit and idempotent; it must never enumerate the global Custom Element
  registry or load modules named by a document.
- Run only the declared verification scripts, audit the Git diff against the allowlist, and report
  changed files and diagnostics. On any preflight, compile, typecheck, or test failure, leave the old
  registration/catalog state intact.

The child Skill never puts credentials, source URLs, SQL, headers, tokens, service objects, DOM
references, functions, or framework instances in a manifest, editor descriptor, Screen Document, or
host snapshot. Dataset samples are used only as sanitized design hints.

## Resources

- [input-bundle.md](references/input-bundle.md) defines the canonical snapshot shape, path policy,
  limits, and safety rules.
- [host-material-skill-template](assets/host-material-skill-template) contains the generated child
  Skill, framework route references, public contract reference, and manifest validator.
- `scripts/create-host-material-skill.mjs` performs strict public-contract validation, deterministic
  rendering, and guarded atomic updates.
