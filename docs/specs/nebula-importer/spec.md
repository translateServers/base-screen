# Nebula Importer Spec

> Status: Active
> Phase: M7
> Provenance: [Nebula Importer Provenance](../../provenance/nebula-importer.md)

## Requirements

- Importer is an offline script, not a production package dependency.
- It reads a supplied JSON export, maps explicit canvas/components/variables fields into the current Document shape, adds an empty Blueprint, then validates with `parseScreenDocument`.
- It writes canonical output only after parser success and writes a report with source path, mapped count, skipped count, and diagnostic codes/paths only.
- It never copies source modules, sends input over network, reads Nebula configuration implicitly, or preserves credentials.

## Acceptance

- Invalid exports produce a report and no canonical document output.
- Successful output reparses as the canonical document.
- Provenance records the exact Nebula commit reviewed and the no-copy decision.
