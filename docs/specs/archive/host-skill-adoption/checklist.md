# Acceptance checklist

- [x] Material registration defaults to `propose`, leaves registration targets unchanged until an
  explicit apply request, and rolls back failed applications (carried over).
- [x] Optional provenance remains backward compatible and the standalone handoff validator checks
  draft associations (carried over).
- [x] Host config accepts exactly `packageManager`, `snapshotScript`, and optional
  `credentialEnvVars`, and verifies the named package script.
- [x] The online exporter receives `BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE`, runs with a bounded
  argument-array child process, and is bounded by the coordinator deadline.
- [x] The single-file snapshot object is strictly validated: unknown fields, credentials,
  connection details, executable content, remote module/URL addresses, and oversized data are
  rejected without changing the committed snapshot or generated Skills.
- [x] The canonical snapshot is sorted by stable identity, deterministic across repeated syncs, and
  committed as `.base-screen/host-snapshot.json`.
- [x] Both business Skills are generated from the same canonical snapshot and record the same
  `snapshotDigest` in their generation manifests.
- [x] Optional `materialTemplates` are guarded and both business Skills record the same
  `catalogDigest` without breaking old snapshots.
- [x] `pnpm base-screen:skills` (no args) refreshes the canonical snapshot and both Skills
  atomically; `verify` is offline and detects missing/extra/changed files and digest mismatch;
  `check-remote` reports drift only and writes nothing; `doctor` reports actionable repair hints.
- [x] `init`/`check`/`sync` are removed from the CLI, documentation, and UI metadata.
- [x] The managed toolkit is installed under `.base-screen/tooling/base-screen-host-skills/**`, never
  under `.agents/skills`; the host `.agents/skills` contains only the two business Skills.
- [x] Toolkit supply records source and file digests, refuses unmanaged or manually changed copies,
  and updates the managed set transactionally.
- [x] Legacy `.agents/skills` copies are auto-migrated only when digests match the manifest; manual
  changes are refused with repair hints.
- [x] The unified `base-screen:skills` package script is registered safely and an incompatible
  existing script of the same name fails closed.
- [x] First install, repeated install, and managed upgrade work; any preflight or apply failure
  restores toolkit, config, canonical snapshot, and both business Skills.
- [x] Online export, `verify`, and `check-remote` cover success, auth/timeout/network/invalid
  catalog failures, and drift reporting without production access.
- [x] Scratch-host forward test covers online export, sync, material authoring, registration
  proposal/application, catalog drift, and dashboard validation.
- [x] All managed and generated Skills pass structural validation.
- [x] Test matrix maps every requirement to automated evidence.
- [x] The required manuals (quick start, daily sync, config reference, troubleshooting, XJ landing
  principles) are complete; a new host developer can install, first-sync, verify, and update by
  reading only the quick-start guide.
- [x] Relevant focused checks and `pnpm verify:m0` pass, with no applicable task or checklist item
  left unchecked.
