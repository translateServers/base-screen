# Nebula Importer Provenance

> Status: Recorded
> Reference commit: `6e84235897e37af1651f8a84bd5d03aa496c2e35`
> Reference scope: architecture and legacy export-shape research only

`scripts/import-nebula.mjs` was authored in Base Screen. It does not copy Nebula source, application configuration, assets, styles, package manifests, or runtime modules. The script accepts an explicitly supplied JSON export and maps only documented structural fields into the Base Screen canonical parser.

No Nebula code or assets are distributed by this repository as a result of this importer.

## Sanitized importer fixtures

The following fixtures are authored, synthetic structural examples used only to exercise the importer detector. They are not copied exports and contain no business records, identities, credentials, URLs, assets, or user information.

| Fixture | Variant signature exercised | Source path / authorization | Sanitization and attribution decision |
| --- | --- | --- | --- |
| `scripts/fixtures/nebula-minimal-export.json` | document root (`nebulaVersion: 1`) | Base Screen-authored synthetic fixture; no upstream file copied | Structural fields only; no attribution required beyond this record |
| `scripts/fixtures/nebula-project-envelope.json` | project envelope (`nebulaVersion: 1`, `project.projectVersion: 1`) | Base Screen-authored synthetic fixture; no upstream file copied | Structural fields only; no attribution required beyond this record |
| `scripts/fixtures/nebula-export-wrapper.json` | export wrapper (`nebulaVersion: 1`, `export.exportVersion: 1`) | Base Screen-authored synthetic fixture; no upstream file copied | Structural fields only; no attribution required beyond this record |
