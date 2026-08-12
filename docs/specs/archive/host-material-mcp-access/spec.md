# Host Material MCP Access

> Status: Active
> Updated: 2026-08-12
> Authority: [ADR-0030](../../../decisions/ADR-0030-host-material-mcp-access.md)

## Goal

Provide a snapshot-backed MCP reference server and generated-Skill guidance for safe online material discovery and validation, while preserving the host-owned runtime and distribution boundary.

## Requirements

### R1: Snapshot templates and digests

The canonical host snapshot MAY contain `materialTemplates`. Templates SHALL be bounded, stable, UTF-8 text-only scaffolds whose paths are covered by host `allowedFiles`; unsafe paths, credentials, remote module addresses, lifecycle scripts, executable HTML/script markers, duplicate identities, and oversized content SHALL fail closed. Both generated Skills SHALL record identical `snapshotDigest` and `catalogDigest` values. Old snapshots remain accepted.

### R2: MCP resources and tools

The reference server SHALL expose the four resource families and five tools accepted by ADR-0030. Tool input schemas SHALL reject unknown fields, search SHALL default to 20 and cap at 50, resource/tool results SHALL be stably ordered, and every success response SHALL contain `hostId`, `catalogDigest`, and `data`. Unknown identities and invalid candidates/configuration SHALL return structured diagnostics without executing content.

### R3: Provider and transport boundary

The reference server SHALL read `.base-screen/host-snapshot.json` through a small provider boundary and run over stdio using the official TypeScript MCP SDK. It SHALL not authenticate, access production services, fetch URLs, load modules, build templates, or mutate the workspace. Documentation SHALL define the production Streamable HTTP, OAuth, tenant, rate-limit, audit, and timeout boundary owned by the host.

### R4: Skill behavior

Generated screen and material Skills SHALL prefer MCP material context when available, compare `catalogDigest`, fall back to local references with an explicit stale-data warning, and continue to run deterministic local validation. Detailed MCP behavior SHALL be progressively disclosed through a reference. Only the two business Skills remain discoverable.

### R5: Synchronization and manuals

The existing default refresh SHALL remain exporter-driven and atomic; `verify` stays offline and `check-remote` stays write-free. Manuals SHALL cover reference-server startup, client connection, resource/tool checks, drift, fallback, failures, security, and concise XJ landing principles.

## Completion definition

R1-R5 have automated evidence, the official client completes a stdio end-to-end run, changed Skills pass structural validation, focused tests and `pnpm verify:m0` pass, manuals are complete, and every applicable task and checklist item is checked.
