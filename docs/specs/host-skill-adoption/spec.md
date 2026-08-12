# Host Skill Adoption

> Status: Active
> Updated: 2026-08-12
> Authority: [ADR-0027](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md), [ADR-0028](../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)

## Goal

Provide a repository-scoped host toolkit that lets a host expose its approved online material and
data catalog through a single canonical snapshot, then install, refresh, verify, and maintain exactly
two host-specific Skills (`design-<hostId>-screens` and `create-<hostId>-material`) under
`.agents/skills`. The toolkit is installed into `.base-screen/tooling`, is not discoverable as a
Codex Skill, and is driven by one idempotent vendor command plus one unified host package script.

## Boundaries

- The adoption workflow is host/developer tooling and is not a Base Screen package or runtime.
- The host owns authentication, tenant selection, online API/SDK calls, catalog filtering, and
  sanitization. Base Screen only requests a single JSON snapshot file from the host exporter.
- The coordinator launches only the configured package script with a snapshot file environment
  variable; it does not implement a generic network client or persist credentials.
- The two generators remain offline, consume only the canonical snapshot, and never call host ports
  or online services.
- Generated Skills and the managed toolkit are repository-scoped authoring assets. Only the two
  generated business Skills are placed under `.agents/skills`; the toolkit never participates in
  Codex Skill discovery.
- An optional `materialProvenance` entry may be routed to generated Skills; draft handoff files
  remain outside the formal online snapshot and are validated only when explicitly supplied.
- No new Base Screen pnpm package, runtime behavior, or public npm API is introduced. The only new
  public surface is the host toolkit CLI, the single-file snapshot contract, and the canonical
  snapshot artifact.

## Requirements

### R1: Host configuration and single-file snapshot exporter contract

The coordinator SHALL accept only `.base-screen/host-skills.json` with `packageManager`,
`snapshotScript`, and an optional `credentialEnvVars` array of safe environment variable names. It
SHALL verify the package script exists at the host root and reject unknown fields, unsafe roots,
unsupported package managers, and missing scripts.

The configured script SHALL receive `BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE` as the absolute path of a
single temporary file and SHALL write one JSON object with exactly these top-level fields:

```json
{
  "host": {},
  "screenGuidelines": "...",
  "materialGuidelines": "...",
  "materialAuthoring": {},
  "components": [],
  "materials": [],
  "resourceTypes": [],
  "datasets": [],
  "datasetSamples": [],
  "materialProvenance": [],
  "materialTemplates": []
}
```

`datasetSamples`, `materialProvenance`, and `materialTemplates` are optional; the other eight fields
are required. The
exporter SHALL use stable ordering, omit timestamps and request identifiers, and never emit
credentials, connection information, private records, executable content, or remote module
addresses. The old multi-file context-directory export form is removed; existing landed hosts
migrate to the single-file form once during this change.

When present, `materialTemplates` SHALL follow ADR-0030: bounded approved UTF-8 scaffolds covered by
the authoring allowlist, never runtime packages or executable instructions.

The coordinator SHALL strictly reject unknown fields, credential-like values, connection details,
executable content, remote module/URL addresses, and oversized data. It SHALL validate host identity,
materials, resource types, dataset parameters, workspace paths, and registration policy, sort every
catalog array by stable identity, and serialize a canonical JSON snapshot. The canonical result
SHALL be committed as `.base-screen/host-snapshot.json`. Both business Skills SHALL be generated from
that same canonical snapshot and record the same `snapshotDigest` and material `catalogDigest` in
their generation manifests.

### R2: Online boundary and strict routing

The coordinator SHALL run the host exporter with argument arrays, no shell, a bounded deadline, and
redacted diagnostics. Export/auth/network/timeout failures SHALL leave the committed canonical
snapshot and both generated Skills unchanged. The coordinator SHALL route the canonical snapshot into
both generators and delegate semantic validation to them.

### R3: Unified host command surface

The host root SHALL expose one registered package script with fixed semantics:

- `pnpm base-screen:skills` — pull the latest snapshot from the online or host data source and
  atomically refresh the canonical snapshot and both business Skills.
- `pnpm base-screen:skills verify` — use only the committed `.base-screen/host-snapshot.json` to
  rebuild both Skills in memory and validate the two installed Skills, their manifests, validators,
  and safety constraints. It SHALL not access the network, not require a token, and serve as the
  default CI gate.
- `pnpm base-screen:skills check-remote` — run the exporter to a temporary snapshot, validate and
  canonicalize it, and report only whether the online catalog changed; it SHALL not modify any file.
- `pnpm base-screen:skills doctor` — check Node, package manager, config, export script, configured
  credential environment variables, and managed file status, and print actionable repair
  suggestions.

The legacy `init`, `check`, and `sync` commands SHALL not be public entry points after the toolkit
migration; they are removed from the CLI, documentation, and UI metadata.

### R4: Managed toolkit supply, layout, upgrade, and migration

The supplier SHALL install the generator scripts, templates, shared validators, and the coordinator
into `.base-screen/tooling/base-screen-host-skills/**` at the host root, never under `.agents/skills`.
It SHALL record a source revision and per-file digests in `.base-screen/host-skill-tooling.json`,
refuse to overwrite unmanaged or manually changed copies, and update the managed set
transactionally without touching host source or the two generated business Skills.

The supplier SHALL be idempotent: a single command detects first install, managed upgrade, or
legacy-layout migration. Legacy `.agents/skills` copies of the three managed Skills SHALL be
auto-migrated only when their digests fully match the recorded management manifest; manually changed
or unmanaged legacy directories SHALL be refused with repair hints. The supplier SHALL infer the
package manager and create missing config, and SHALL safely register the unified `base-screen:skills`
package script, failing closed when an incompatible script of that name already exists.

### R5: Registration safety integration

The material authoring bundle SHALL accept registration policy `propose` or `apply`, normalize an
omitted policy to `propose`, and render instructions that keep registration targets unchanged in
proposal mode. Applying a proposal SHALL require an explicit user request, a fresh target-content
check, and verification with rollback on failure.

### R6: Repository distribution and validation

The adoption Skill SHALL document the host layout, snapshot contract, unified commands, online
credential boundary, migration, and drift workflow. The adoption fixture SHALL exercise a local
simulated online source; no test or default command SHALL access a production service. The host
`.agents/skills` SHALL contain only the two business Skills.

### R7: Draft handoff boundary

The coordinator SHALL keep the default sync, `verify`, and `check-remote` formal-snapshot-only and
provide a standalone validator for request/candidate/draft-catalog association. The generated
dashboard validator SHALL be the explicit entry point for draft overlay and published-only checks.

### R8: One-command host setup with atomic rollback

The supplier SHALL provide one repeatable setup command that safely installs or updates the managed
toolkit, creates the strict host config when absent, registers the unified package script, and runs
the full canonical-snapshot sync. It SHALL preflight the toolkit digests, the snapshot, and both
generation results before committing. On any preflight or apply failure, the command SHALL restore
the toolkit, config, canonical snapshot, and both business Skills to their previous state.

## Completion definition

R1-R8 have focused automated evidence, the toolkit and both generated Skills pass structural
validation, the single-file snapshot contract is exercised end to end (first install, repeated
install, managed upgrade, legacy migration, manual-change refusal, script conflict, verify,
check-remote, doctor, and atomic rollback), a scratch host forward run completes an online export
through sync and verify, required quality gates pass, the required manuals are complete, and every
applicable task and checklist item is checked.
