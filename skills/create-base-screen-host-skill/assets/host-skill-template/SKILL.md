---
name: {{SKILL_NAME}}
description: {{DESCRIPTION_YAML}}
---

# {{HOST_NAME}} dashboard designer

Design only with the host catalog and guidelines in this Skill. The output is a complete canonical Screen Document JSON file that the host can import into Base Screen. A generated Skill is a deterministic snapshot: it never fetches online materials.

## Before designing

1. Read [host.md](references/host.md) and follow its visual rules.
2. Search [materials.json](references/materials.json) for the smallest set of suitable material types. Read a material's manifest before using it.
3. Match each host-backed data component to one entry in [datasets.json](references/datasets.json) and one resource type in [resource-types.json](references/resource-types.json). Read the optional matching sample only when it helps choose a visual treatment.
4. Read [document-contract.md](references/document-contract.md) for the output shape. Never add fields to the canonical document.
5. If [material-provenance.json](references/material-provenance.json) exists, use it to distinguish `code` and `online` materials. Online materials are read-only references. A draft catalog is never implicit; use only the file explicitly supplied by the host.

## Create or revise

- For a new request, choose the canvas from `host.md`, establish a stable grid, then place a visual hierarchy of title, summary, trends, comparisons, and detail areas appropriate to the request.
- For an existing document, validate it first and preserve component IDs, unchanged components, and unrelated props/style. Change only what the request requires.
- Use only material `type` values from `materials.json`, resource identities from `datasets.json`, and parameter names accepted by the selected resource type's `configSchema`.
- Keep every resource parameter literal in this scope. Keep `variables: []` and `blueprint: { "rules": [] }` unless the host Skill is regenerated with a broader contract.
- Use `dataSource.type: "host-resource"` for host datasets and set binding roles only with declared dataset field IDs and compatible value types. Use static data only when the material declares `static` capability.
- Do not invent URLs, SQL, credentials, host actions, variables, event rules, material types, resource IDs, fields, or undocumented props. If the formal catalog and an explicitly supplied draft catalog do not contain a required material type, stop and write a validated `material-request.json` with `requestId`, `hostId`, `screenDraftId`, purpose, framework, size, data fields, and events; the helper `node scripts/create-material-request.mjs` can create it after the host supplies those values. Do not fabricate a manifest.

## Validate and deliver

1. Write the complete document to a JSON file in the workspace.
2. For design-time drafts, run `node scripts/validate-screen-document.mjs <document.json> --draft-material-catalog <draft-material-catalog.json>` from the host project. The catalog must be explicitly supplied and associated with the same host and screen draft by the host workflow.
3. Before publishing, run `node scripts/validate-screen-document.mjs <document.json> --published-only`. This fails closed when the document still references a draft material.
4. Return the document path, the selected materials/datasets, and a short explanation of the layout and binding choices. Explicitly report whether each material is formal code, online read-only, or draft-only. Mention any visual behavior that could not be checked without the host's live preview.

The validator is the final authority for structural, catalog, data-binding, and semantic checks. Do not bypass it by removing fields or weakening the document shape.
