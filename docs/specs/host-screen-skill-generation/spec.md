# Host Screen Skill Generation

> Status: Active
> Updated: 2026-08-10
> Authority: [ADR-0027](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md), [ADR-0023](../../decisions/ADR-0023-host-dataset-resource-integration.md), [ADR-0025](../../decisions/ADR-0025-data-runtime-hardening.md), [ADR-0028](../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)

## Goal

Provide a repository-distributed Codex Skill that converts a host-owned, offline and sanitized
catalog snapshot into a host-specific Skill for creating or revising importable Base Screen documents.

## Boundaries

- The generator is a host/developer-side tool, not a Base Screen package or runtime service.
- It consumes JSON-safe material manifests, resource type schemas, dataset descriptors, optional bounded
  samples, and a host design guideline document.
- It never calls host ports, queries live data, persists transport details, or places credentials and
  service objects in a Screen Document.
- The generated Skill uses only public Contracts, Plugin Core, and Core parsers/validators.

## Requirements

### R1: Snapshot bundle

The generator SHALL accept the documented allowlisted bundle, reject unknown files and unknown fields,
validate all catalog entries through existing public parsers, and fail closed on invalid or incomplete
input. Dataset descriptor parameter names SHALL match the selected resource type `configSchema` exactly.

### R2: Deterministic generation

The generator SHALL produce a child Skill named `design-<hostId>-screens` with stable metadata, host
guidelines, normalized catalog references, current Screen Document JSON Schema, and a document validator.
The same input SHALL produce byte-identical output.

### R3: Guarded update

Initial creation SHALL refuse to overwrite an existing directory. An update SHALL require the matching
generator marker, stage and validate the complete replacement, and restore the previous generated Skill
if the replacement fails.

### R4: Generated authoring workflow

The child Skill SHALL support new documents and targeted revisions. It SHALL use only catalog identities,
literal resource parameters, valid material props/style, and compatible dataset field roles. For this
scope it SHALL leave variables and Blueprint rules empty and SHALL instruct the model to run validation
before delivery.

### R5: Document validation

The generated validator SHALL run canonical Contracts parsing, Core semantic validation, material schema
validation, parent-child capability checks, resource `configSchema` checks, dataset identity checks, and
material binding-role validation. It SHALL return nonzero for errors and may report out-of-canvas layout
as an advisory warning.

## Completion definition

R1–R5 have focused automated evidence, the generated Skill passes `quick_validate.py`, the relevant
repository quality gates pass, and all applicable checklist items are checked.
