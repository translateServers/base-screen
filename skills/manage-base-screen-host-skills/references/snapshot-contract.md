# Host snapshot exporter contract

The host package script named by `.base-screen/host-skills.json` receives the absolute output
directory in `BASE_SCREEN_HOST_SKILL_CONTEXT_DIR`. It must write a single flat directory containing
only the following files:

| File | Required | Purpose |
| --- | --- | --- |
| `host.json` | yes | Host identity, locale, and default canvas |
| `design-guidelines.md` | yes | Dashboard visual and interaction rules |
| `material-authoring.json` | yes | Framework, workspace, roots, registration policy, and write allowlist |
| `material-guidelines.md` | yes | Material authoring rules |
| `components.json` | yes | Sanitized reusable component metadata |
| `materials.json` | yes | Existing public material manifests |
| `resource-types.json` | yes | Host data-resource contributions |
| `datasets.json` | yes | Host dataset descriptors and parameter schemas |
| `dataset-samples.json` | no | Bounded samples classified as `sanitized` |

The exporter should query the host's approved or enabled catalog through its existing authenticated
client. It must filter draft/unpublished records before serialization. Approval state, tenant IDs,
request IDs, timestamps, transport URLs, headers, credentials, private records, and executable
source are not part of the output contract.

The output must be deterministic: use stable IDs for ordering and omit request-dependent values.
The coordinator rejects unknown entries, directories, symbolic links, oversized files, missing
required files, and malformed JSON. The two existing generators then apply the full Contracts and
Plugin Core parsers, path checks, parameter authority checks, and credential-like value checks.

If authentication, authorization, network access, or catalog export fails, exit non-zero and write
no partial context. The coordinator leaves the previously generated Skills untouched.
