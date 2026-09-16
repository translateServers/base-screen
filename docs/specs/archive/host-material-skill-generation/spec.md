# Host Material Skill Generation

> Status: Archived (historical acceptance record)
> Updated: 2026-08-12
> Authority: [ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md), [ADR-0003](../../../decisions/ADR-0003-web-component-material-abi-and-registration.md), ADR-0004, ADR-0028

## Goal

Provide a repository-distributed Codex Skill that converts an offline, sanitized host authoring
snapshot into a host-specific Skill for creating or revising one native, React, or Vue Base Screen
material in an explicitly allowlisted workspace.

## Boundaries

- The generator is a host/developer-side Skill tool, not a Base Screen package or runtime service.
- It consumes JSON-safe manifests, data-resource descriptors, component metadata, framework rules,
  workspace paths, and bounded sanitized samples.
- It never installs dependencies, runs live network calls, stores credentials, publishes artifacts,
  commits changes, activates production code, or enumerates the global Custom Element registry.
- Generated source uses only public `@base-screen/plugin-sdk`, `@base-screen/react`,
  `@base-screen/vue`, `@base-screen/plugin-core`, and host-owned APIs.
- Online materials are read-only references. A draft-only workflow may emit a pending-review candidate
  without changing formal registration targets.

## Requirements

### R1: Canonical snapshot input and path authority

The generator SHALL accept the documented canonical single-file host snapshot
(`.base-screen/host-snapshot.json`), reject unknown top-level fields and unsafe workspace paths,
validate the selected framework, roots, registration mode, verification script names,
component metadata, material manifests, resource types, datasets, and optional samples, and fail closed
on credential-like values or invalid/incomplete input.

### R2: Deterministic and guarded generation

The generator SHALL produce `create-<hostId>-material` with stable metadata, host rules, one selected
framework route, workspace policy, catalog references, a public contract reference, a manifest
validator, and a generation marker. Identical input SHALL produce byte-identical output. Initial
generation SHALL refuse overwrite; updates SHALL require the matching marker and use staged atomic
replacement with rollback on failure.

### R3: Generated authoring workflow

The child Skill SHALL guide workspace verification, new material creation, targeted revision, public
ABI selection, JSON-safe manifests/descriptors/events, focused tests, explicit standalone/plugin
registration policy, named verification scripts, and allowlist diff auditing. The policy SHALL
default to `propose`: source and tests may be created, but configured registration targets remain
unchanged until an explicit apply request. `apply` SHALL update only the configured targets and
restore them if verification fails. The child Skill SHALL preserve the prior catalog when preflight
or verification fails and SHALL tell the host to refresh its dashboard Skill snapshot after a
successful catalog change.

### R4: Public material contract

The generated validator SHALL use the public Plugin Core parsers to validate manifest identity,
defaults, props/style schemas, editor descriptors, data-binding roles, and catalog identity conflicts.
The generated instructions SHALL describe native, React, and Vue bridge constraints, including the
current adapter boundary and the standard material event.

### R5: Host workspace package resolution

The generated validator SHALL load the public parsers from the host workspace's installed `@base-screen/*`
packages when present, resolving ESM-only `exports` entries from the workspace `package.json`; otherwise it
SHALL fall back to a Base Screen checkout's built package `dist`.

### R6: Draft-only candidate workflow

The generated Skill SHALL support source, test, manifest, and `material-candidate.json` output with
`status: pending-review` and `registration: draft-only`; it SHALL not modify registration files in
that workflow and SHALL preserve the existing formal `propose/apply` policy for published code.

## Completion definition

R1–R6 have focused automated evidence, the meta and generated Skills pass Skill validation, all
generator and validator tests pass, relevant repository quality gates pass, and every applicable
checklist item is checked.
