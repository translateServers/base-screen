# Host Skill Adoption

> Status: Active
> Updated: 2026-08-11
> Authority: [ADR-0027](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md), [ADR-0028](../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)

## Goal

Provide a repository-scoped adoption workflow that lets a host expose its approved online
material and data catalog through a controlled snapshot exporter, then generate and maintain the
host-specific dashboard-design and material-authoring Skills in `.agents/skills`.

## Boundaries

- The adoption workflow is host/developer tooling and is not a Base Screen package or runtime.
- The host owns authentication, tenant selection, online API/SDK calls, catalog filtering, and
  sanitization.
- The coordinator launches only the configured package script with an output directory environment
  variable; it does not implement a generic network client or persist credentials.
- The two existing generators remain offline, consume only strict temporary bundles, and never call
  host ports or online services.
- Generated Skills and the three managed tooling Skills are repository-scoped authoring assets.

## Requirements

### R1: Host configuration and exporter contract

The coordinator SHALL accept only `.base-screen/host-skills.json` with `packageManager` and
`snapshotScript`, verify the package script exists at the host root, and reject unknown fields,
unsafe roots, unsupported package managers, and missing scripts.

The configured script SHALL receive `BASE_SCREEN_HOST_SKILL_CONTEXT_DIR` and SHALL write the
documented allowlisted context files. It SHALL use stable ordering, omit timestamps and request
identifiers, and never emit credentials, transport details, private records, or executable code.

### R2: Online boundary and strict routing

The coordinator SHALL run the host exporter with argument arrays, no shell, a bounded deadline, and
redacted diagnostics. Export/auth/network/timeout failures SHALL leave existing generated Skills
unchanged. The coordinator SHALL route one context into the exact screen and material bundle
allowlists and delegate semantic validation to the existing public generators.

### R3: Check, sync, and verify

`check` SHALL perform a read-only export and validation. `sync` SHALL preflight both generated
outputs and atomically replace the two generated Skill directories, refusing unmarked targets and
rolling back both targets if any step fails. `verify` SHALL rebuild in memory and report missing,
extra, or changed generated files without writing the repository.

### R4: Managed tooling supply

The supplier SHALL copy the two generator Skills and the coordinator Skill into a host's
`.agents/skills`, record a source revision and per-file digests, refuse to overwrite unmanaged or
manually changed copies, and update the managed set transactionally without touching host source or
generated child Skills.

### R5: Registration safety integration

The material authoring bundle SHALL accept registration policy `propose` or `apply`, normalize an
omitted policy to `propose`, and render instructions that keep registration targets unchanged in
proposal mode. Applying a proposal SHALL require an explicit user request, a fresh target-content
check, and verification with rollback on failure.

### R6: Repository distribution and validation

The adoption Skill SHALL document the host layout, exporter contract, commands, online credential
boundary, and drift workflow. The adoption fixture SHALL exercise a local simulated online source;
no test or default command SHALL access a production service.

## Completion definition

R1-R6 have focused automated evidence, all four Skill directories and the supplier pass validation,
the material generator policy migration is covered by tests, a scratch host forward run completes
online export through sync and verify, required quality gates pass, and every applicable task and
checklist item is checked.
