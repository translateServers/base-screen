# Tasks

- [x] Create and validate the `manage-base-screen-host-skills` Skill and UI metadata.
  - [x] Replace the scaffold with the repository adoption workflow.
  - [x] Document the online snapshot contract and host credential boundary.
- [x] Implement host configuration and online snapshot execution.
  - [x] Validate strict config and package script discovery.
  - [x] Run the configured script with a bounded, argument-array child process.
  - [x] Reject unsafe, incomplete, sensitive, oversized, and unsupported context output; require
    the exporter contract to omit transient fields.
- [x] Implement strict dual-bundle routing and commands.
  - [x] Route the shared context to screen and material allowlists.
  - [x] Implement read-only `check`, transactional `sync`, and drift-only `verify`.
  - [x] Preserve both generated targets on every preflight or replacement failure.
- [x] Implement managed tooling supply.
  - [x] Copy the two generators and coordinator into `.agents/skills`.
  - [x] Record and validate source/file digests and reject manual changes.
  - [x] Update the managed set transactionally.
- [x] Complete registration policy integration.
  - [x] Add `propose`/`apply` parsing and safe default.
  - [x] Render proposal/apply workflow and update bundle documentation.
  - [x] Add focused policy tests and update the material Spec evidence.
- [x] Add fixtures, tests, and forward validation.
  - [x] Add a local simulated online exporter and scratch host fixture.
  - [x] Cover failure, drift, atomicity, supply, and registration scenarios.
  - [x] Run Skill validation and the required repository quality gates.
