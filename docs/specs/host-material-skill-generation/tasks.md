# Tasks

- [x] Create and validate the `create-base-screen-host-material-skill` skeleton and UI metadata.
  - [x] Replace the generated placeholder with the snapshot-to-Skill workflow.
  - [x] Add the strict input bundle reference and generated child templates.
- [x] Implement authoring bundle validation.
  - [x] Validate host profile, framework, workspace roots, registration mode, path allowlist, and script names.
  - [x] Validate component metadata, material manifests, resource types, datasets, parameter authority, and bounded samples.
  - [x] Reject unknown fields, unsafe paths, credential-like values, and incomplete input.
- [x] Implement deterministic rendering and guarded updates.
  - [x] Render host rules, selected framework route, workspace policy, catalogs, contract reference, validator, and marker.
  - [x] Refuse unmarked overwrite and stage generated replacement atomically.
- [x] Implement the generated public-ABI manifest validator and authoring workflow.
  - [x] Validate manifest/defaults and catalog type conflicts through public parsers.
  - [x] Document native, React, Vue, adapter, event, descriptor, and explicit registration routes.
- [x] Add focused fixtures and automated tests for deterministic generation, invalid input, all framework routes, guarded updates, and generated manifest validation.
- [x] Run Skill validation, focused tests, and required repository quality gates; update the test matrix and checklist with evidence.
