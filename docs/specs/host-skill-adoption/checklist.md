# Acceptance checklist

- [x] Coordinator Skill frontmatter and `agents/openai.yaml` pass Skill validation (`quick_validate.py`).
- [x] Host config accepts exactly `packageManager` and `snapshotScript` and verifies the named
  package script.
- [x] Online exporter receives the documented output directory, runs with a bounded argument-array
  child process, and is
  bounded by the coordinator deadline.
- [x] Unknown context files, symlinks, credential-like values, oversized files, malformed JSON, and
  unsupported output are rejected without changing generated Skills; the exporter contract requires
  stable ordering and excludes transient fields.
- [x] Shared context is routed to the exact screen and material generator allowlists.
- [x] `check` is read-only, `sync` is transactional for both generated Skills, and `verify` reports
  missing/extra/changed files without writing.
- [x] Unmarked generated targets and manually changed managed tooling copies are never overwritten.
- [x] Supplier records source and file digests and updates only the three managed tooling Skills.
- [x] Material registration defaults to `propose`, leaves registration targets unchanged until an
  explicit apply request, and rolls back failed applications.
- [x] Scratch-host forward test covers online export, sync, material authoring, registration
  proposal/application, catalog drift, and dashboard validation.
- [x] Test matrix maps every requirement to automated evidence.
- [x] Relevant focused checks and `pnpm verify:m0` pass, with no applicable task or checklist item
  left unchecked.
