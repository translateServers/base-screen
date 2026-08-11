# Tasks

- [x] Create and validate the `create-base-screen-host-skill` Skill skeleton and UI metadata.
  - [x] Replace the generated placeholder `SKILL.md` with the snapshot-to-Skill workflow.
  - [x] Add the input bundle reference and child Skill template.
- [x] Implement strict snapshot parsing and public-contract validation.
  - [x] Validate host profile, material manifests, resource type schemas, datasets, and optional samples.
  - [x] Enforce descriptor/configSchema authority and bounded sanitized samples.
- [x] Implement deterministic child Skill rendering and guarded atomic updates.
  - [x] Render catalog references, guidelines, schema, validator, metadata, and generation marker.
  - [x] Refuse unmarked overwrite and restore the prior generated directory on update failure.
- [x] Implement the generated Screen Document validator.
  - [x] Check canonical/core semantics, catalog identities, props/style, parent capabilities, data capabilities, parameters, and bindings.
  - [x] Add advisory out-of-canvas diagnostics.
- [x] Add focused fixtures and automated tests for valid generation, invalid snapshots, deterministic output, update rollback, and document validation.
- [x] Run Skill validation, focused tests, forward tests, and required repository quality gates; update the test matrix and checklist with evidence.
