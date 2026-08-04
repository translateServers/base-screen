# Nebula Importer Spec

> Status: Active
> Phase: M7
> Provenance: [Nebula Importer Provenance](../../provenance/nebula-importer.md)

## Requirements

- Importer is an offline script, not a production package dependency.
- It analyzes an explicitly supplied JSON export as exactly one recognized document-root, project-envelope, or export-wrapper variant, then converts only with an explicit decision file.
- It maps explicit canvas/components/variables fields into the current Document shape, adds an empty V1 Blueprint when no provable dynamic mapping exists, and validates with `parseScreenDocument`.
- Analyze mode writes only a field-level report. Conversion writes canonical output only after every blocking finding is resolved and parser/serializer round-trip succeeds; report and output use atomic replacement.
- It never copies source modules, sends input over network, reads Nebula configuration implicitly, or preserves credentials.

## Acceptance

- Invalid exports produce a report and no canonical document output.
- Successful output reparses as the canonical document.
- Provenance records the exact Nebula commit reviewed and the no-copy decision.
