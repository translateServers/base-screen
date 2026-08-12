# Test matrix

| Requirement | Scenario | Evidence |
| --- | --- | --- |
| R1 | Old snapshot; valid templates; duplicate/unsafe/oversized/secret/remote/lifecycle rejection; stable digests | `tests/host-material-mcp.test.ts`, generator tests |
| R2 | Resource listing/reading/not-found; five tools; strict input; filtering/limits; structured diagnostics | `tests/host-material-mcp.test.ts` |
| R3 | Snapshot provider and official-client stdio end-to-end; no execution or mutation | `tests/host-material-mcp.test.ts` |
| R4 | Generated online-first reference, fallback warning, digest manifests, templates | generator tests |
| R5 | Existing sync/verify/check-remote regression; manuals and indexes | host adoption tests and manual review |
