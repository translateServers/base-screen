# Host Draft Material Workflow

> Status: Active
> Updated: 2026-08-12
> Authority: [ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md), [ADR-0029](../../../decisions/ADR-0029-host-managed-material-package-distribution.md)

## Goal

Provide a host-owned, file-based handoff for creating temporary materials while designing a single
screen draft. The workflow must remain offline inside Base Screen, must not alter formal registration,
and must fail closed before publication when a draft material is still referenced.

## Boundaries

- The host or its AI panel creates the request and owns source, build, test, review, and promotion.
- Base Screen validates JSON-safe handoff files and consumes only an explicitly supplied draft catalog.
- Formal online snapshots remain published-only deterministic references; draft files never enter them.
- `materials.json` remains a pure `BaseScreenMaterialManifest` array and no runtime package/API is added.

## Requirements

### R1: Handoff contracts

The tooling SHALL validate `material-request.json`, `material-candidate.json`,
`draft-material-catalog.json`, and optional `material-provenance.json`, rejecting unknown fields,
duplicate identities, unsafe paths/content, and association mismatches.

### R2: Draft overlay

The generated dashboard validator SHALL merge an explicitly supplied draft catalog with the formal
catalog, reject inconsistent duplicate types, and preserve the formal result when an identical type
is supplied. Without the explicit file, existing validation behavior remains unchanged.

### R3: Draft-only authoring

The generated material Skill SHALL provide a draft-only workflow that emits source, tests, a manifest,
and a pending-review candidate without changing registration targets. Online materials are read-only;
only host-allowed editable code materials may be revised.

### R4: Publication guard

The dashboard validator SHALL provide `--published-only` and fail when a document references a draft
material. The host must promote or remove the draft before publishing.

### R5: Formal snapshot and compatibility

Coordinator `check`, `sync`, and `verify` SHALL continue to process only the formal snapshot. Optional
provenance is routed to generated Skills, while old snapshots without it remain valid.

### R6: Trusted package boundary

Browser examples SHALL demonstrate host package definition, immutable formal/draft catalog composition,
Designer unload/reconfigure restoration, and publication rejection without adding a mutable catalog
runtime API or network behavior.

## Completion definition

R1–R6 have focused automated evidence, the generated Skills and handoff helper pass validation, the
browser harness demonstrates the draft lifecycle, relevant quality gates pass, and all applicable
checklist items are checked.
