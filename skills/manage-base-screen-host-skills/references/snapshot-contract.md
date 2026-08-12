# Host snapshot exporter contract

The host package script named by `.base-screen/host-skills.json` receives the absolute path of a
single temporary file in `BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE`. It must write one JSON object to
that file with exactly these top-level fields:

```json
{
  "host": {},
  "screenGuidelines": "...",
  "materialGuidelines": "...",
  "materialAuthoring": {},
  "components": [],
  "materials": [],
  "resourceTypes": [],
  "datasets": [],
  "datasetSamples": [],
  "materialProvenance": [],
  "materialTemplates": []
}
```

| Field | Required | Purpose |
| --- | --- | --- |
| `host` | yes | Host identity, locale, and default canvas |
| `screenGuidelines` | yes | Dashboard visual and interaction rules |
| `materialGuidelines` | yes | Material authoring rules |
| `materialAuthoring` | yes | Framework, workspace, roots, registration policy, and write allowlist |
| `components` | yes | Sanitized reusable component metadata |
| `materials` | yes | Existing public material manifests |
| `resourceTypes` | yes | Host data-resource contributions |
| `datasets` | yes | Host dataset descriptors and parameter schemas |
| `datasetSamples` | no | Bounded samples classified as `sanitized` |
| `materialProvenance` | no | Source classification for published materials (`code` or `online`) |
| `materialTemplates` | no | Bounded approved UTF-8 scaffolds covered by `materialAuthoring.allowedFiles` |

The exporter should query the host's approved or enabled catalog through its existing authenticated
client. It must filter draft/unpublished records before serialization. Approval state, tenant IDs,
request IDs, timestamps, transport URLs, headers, credentials, connection details, private records,
unapproved executable source, runtime packages, and remote module addresses are not part of the output contract. Guarded `materialTemplates` may contain text scaffolds, but never lifecycle scripts, credentials, remote imports, or commands intended for execution. Use stable IDs
for ordering and omit request-dependent values.

The coordinator strictly rejects unknown fields, missing fields, credential-like values, executable
content, remote URLs, and oversized data, then sorts every catalog array by stable identity and
writes the canonical result as `.base-screen/host-snapshot.json`. The two generators then apply the
full Contracts and Plugin Core parsers, path checks, parameter authority checks, and credential-like
value checks.

If authentication, authorization, network access, or catalog export fails, exit non-zero and write
no partial snapshot. The coordinator leaves the previously committed snapshot and generated Skills
untouched.
