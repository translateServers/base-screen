# ADR-0011: Nebula Importer Auditable Migration

> Status: Accepted
> Date: 2026-08-04
> Scope: offline Nebula export variant detection, loss reporting, decision-controlled conversion, and atomic output
> Implements: [Nebula Importer Spec](../specs/nebula-importer/spec.md)

## Context

The initial importer maps one near-canonical fixture and emits aggregate counts. It cannot safely explain or control lossy conversion across real legacy export envelopes. Migration must remain offline and must never become a path into Engine, project persistence, credentials, or Nebula runtime code.

## Decision

1. The importer is an offline two-phase tool: `--analyze` detects a single recognized export variant and writes only a report; conversion separately consumes an explicit decision file.
2. The initial supported variants are document root, project envelope, and export wrapper. Each detector has an explicit structural signature and version. Zero matches or more than one match is a blocking failure and writes no canonical document.
3. Reports use field-level findings with code, severity, source path, optional target path, reason, and optional decision id. Every skipped component and unmapped field receives a finding; aggregate counters are supplementary only.
4. Decisions are strict data with `map`, `drop`, or `cancel`. A drop must be explicit, a map must identify a compatible target material type, and cancel terminates conversion. Unresolved blocking findings prevent output.
5. Input, canonical output, report, and decision paths must all be distinct before any input is read. Report and output writes use sibling temporary files followed by atomic rename. A failure cannot leave stale successful canonical output.
6. A successful canonical output is reparsed and serialized through `@base-screen/contracts`. The importer never imports Engine, calls a project adapter, saves, publishes, reads Nebula configuration, accesses a network, or retains assets, URLs, credentials, or business data.
7. Fixtures must be sanitized real-shape exports with file-level provenance recording source commit/path, authorization, sanitization, and no-copy rationale.

## Consequences

- Loss is visible and deliberately resolved instead of silently inferred.
- The migration tool is independently auditable and safe to run in CI.
- New variants require an explicit detector, fixtures, provenance, and tests.

## Verification

Tests cover all three variants, zero/multiple matching, analysis-only behavior, finding completeness, strict decisions, path collision rejection, atomic output, and parser round-trip.
