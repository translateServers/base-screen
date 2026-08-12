# Host Draft Material Workflow Checklist

- [x] No Engine, Contracts, Renderer, SDK, or runtime public API was added.
- [x] Draft material input is explicit and never fetched from a network or host service.
- [x] Formal material manifests remain unchanged and contain no provenance field.
- [x] Request, candidate, catalog, and provenance validators reject unknown fields and unsafe values.
- [x] Candidate status is pending-review and registration is draft-only.
- [x] Formal snapshot check/sync/verify keeps prior generated Skills on failure.
- [x] Published-only validation rejects documents that still reference draft types.
- [x] Browser harness uses existing createMaterialPackage and immutable catalog construction.
- [x] Old snapshots without material-provenance.json remain accepted.
- [x] Test matrix and evidence are updated before completion.
