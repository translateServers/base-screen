# Tasks

- [x] Complete registration policy integration (carried over).
  - [x] Add `propose`/`apply` parsing and safe default.
  - [x] Render proposal/apply workflow and update bundle documentation.
  - [x] Add focused policy tests and update the material Spec evidence.
- [x] Route optional provenance and supply the shared handoff helper (carried over).
- [x] Freeze the single-file snapshot contract.
  - [x] Replace the multi-file context-directory exporter contract with
    `BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE` and the ten-field snapshot object.
  - [x] Update the host config contract and the snapshot-contract reference.
  - [x] Update the generator input references to the canonical snapshot file.
- [x] Implement strict snapshot validation and canonicalization.
  - [x] Reject unknown fields, credentials, connection details, executable content, remote
    module/URL addresses, and oversized data.
  - [x] Validate host identity, materials, resource types, dataset parameters, workspace paths, and
    registration policy.
  - [x] Sort catalog arrays by stable identity and serialize canonical JSON.
  - [x] Commit the canonical result as `.base-screen/host-snapshot.json`.
- [x] Make both generators consume the same canonical snapshot.
  - [x] Switch both generator inputs from bundle directories to the single snapshot file.
  - [x] Record the same `snapshotDigest` in both generation manifests.
- [x] Move the managed toolkit to `.base-screen/tooling` and migrate legacy layouts.
  - [x] Vendor generator scripts, templates, validators, and coordinator under
    `.base-screen/tooling/base-screen-host-skills/**`, never under `.agents/skills`.
  - [x] Keep the digest manifest and refuse unmanaged or manually changed copies.
  - [x] Auto-migrate legacy `.agents/skills` copies only when digests match; refuse manual changes
    with repair hints.
  - [x] Safely register the unified `base-screen:skills` package script and fail closed on conflicts.
- [x] Implement the unified host command surface.
  - [x] Default sync: exporter → validate → canonicalize → atomic refresh of snapshot and both Skills.
  - [x] `verify`: offline rebuild from the committed snapshot; detect missing, extra, and changed
    files and manifest digest mismatch.
  - [x] `check-remote`: report drift only, write nothing.
  - [x] `doctor`: report Node, package manager, config, export script, credentials, and managed file
    status with repair hints.
  - [x] Remove `init`/`check`/`sync` from the CLI, docs, and UI metadata.
- [x] Make the one-command setup transactional.
  - [x] Preflight toolkit digests, snapshot, and both generation results before committing.
  - [x] Restore toolkit, config, canonical snapshot, and both Skills on any failure.
- [x] Add fixtures, tests, and forward validation.
  - [x] Cover first install, repeated install, managed upgrade, legacy migration, manual-change
    refusal, and package script conflict.
  - [x] Cover strict snapshot rejection, canonical stability, online sync success and failure, and
    offline verify drift.
  - [x] Cover check-remote write-free drift reporting and doctor checks.
  - [x] Cover snapshot/tooling/Skill preservation on every failure path.
- [x] Write the required manuals and update repository documentation.
  - [x] Quick-start guide with the single install command and first sync.
  - [x] Daily-use and synchronization guide (refresh, check-remote, manual merge, offline verify,
    rollback, snapshot inspection).
  - [x] Configuration reference (host-skills.json, snapshot exporter input/output, env vars,
    business Skill layout).
  - [x] Troubleshooting guide (toolkit version, invalid snapshot, online failure, credentials,
    manual edits, CI failure, doctor).
  - [x] XJ Data Hub landing-principles page.
  - [x] Update `docs/usage.md` and the README Spec index.
- [x] Run Skill validation and the required repository quality gates.
  - [x] All managed and generated Skills pass structural validation.
  - [x] Focused tests pass, then the full `pnpm verify:m0` passes with every applicable task and
    checklist item checked.
- [x] Extend the snapshot additively for online material MCP access.
  - [x] Validate optional guarded material templates and keep old snapshots compatible.
  - [x] Record identical material catalog digests in both generated Skills.
  - [x] Keep default refresh atomic, verify offline, and check-remote write-free.
