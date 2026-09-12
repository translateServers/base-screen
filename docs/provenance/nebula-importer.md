# Nebula Importer Provenance

> Status: Recorded
> Reference commit: `6e84235897e37af1651f8a84bd5d03aa496c2e35`
> Reference scope: architecture and legacy export-shape research only

`scripts/import-nebula.mjs` was authored in Base Screen. It does not copy Nebula source, application configuration, assets, styles, package manifests, or runtime modules. The script accepts an explicitly supplied JSON export and maps only documented structural fields into the Base Screen canonical parser.

No Nebula code or assets are distributed by this repository as a result of this importer.

## Authorization record

On 2026-08-04, the repository owner confirmed that they own the rights to use and redistribute
sanitized Nebula export fixtures in Base Screen MIT test artifacts. This authorization applies when
the fixtures are supplied with their individual source path, source commit, sanitization record, and
attribution decision. It does not convert Base Screen-authored synthetic fixtures into copied real
exports.

## Authorized sanitized fixture derivations

The following files are sanitized, adapted JSON derivations of Nebula samples. The repository owner
authorized their use and redistribution under the record above. Each adapter adds only the current
importer variant wrapper and removes fields that do not map into the canonical fixture shape.

| Fixture | Source commit and path | Sanitization and modification | Attribution decision |
| --- | --- | --- | --- |
| `scripts/fixtures/nebula-authorized-document-root.json` | `2523a9086378b36f0ce383edbfe3b57a9eb388ea`, `apps/dynamic-sdk-vue-consumer/src/document.ts` | Replaced component ids, names, titles and binding fields; removed host data-source ids/bindings; converted legacy position rectangle into position/size; added document-root adapter wrapper | Authorized fixture derivation; no Nebula source code, config, assets or credentials copied |
| `scripts/fixtures/nebula-authorized-project-envelope.json` | `761052592ece88d1f2674b85ee3575b8d0ad4e83`, `apps/screen-sdk-host/src/fixtures.ts` | Replaced project id/name/revision, region labels and variable values; omitted image/data-URI content; converted legacy document fields; added project-envelope adapter wrapper | Authorized fixture derivation; no Nebula source code, config, assets or credentials copied |
| `scripts/fixtures/nebula-authorized-export-wrapper.json` | `761052592ece88d1f2674b85ee3575b8d0ad4e83`, `apps/screen-sdk-host/src/in-memory-adapter.ts` | Replaced file/project metadata; omitted transfer data URI and host fields; converted the transfer document; added export-wrapper adapter wrapper | Authorized fixture derivation; no Nebula source code, config, assets or credentials copied |
