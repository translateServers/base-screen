---
name: {{SKILL_NAME}}
description: {{DESCRIPTION_YAML}}
---

# {{HOST_NAME}} material authoring

Use this Skill to create or revise one Base Screen material in the host workspace. Read the host
rules and workspace policy before editing; then load only the matching catalog entries and the
selected framework route. Use the host material MCP for discovery and early validation when
available; read [material-mcp.md](references/material-mcp.md) only when that path is relevant.

## Required workflow

1. Confirm the current directory is the host Git workspace and contains `{{ROOT_MARKER}}`. Do not
   create a workspace, install dependencies, commit, push, publish, or activate production code.
2. Read [host.md](references/host.md), [workspace.json](references/workspace.json),
   [material-contract.md](references/material-contract.md), [framework.md](references/framework.md),
   [materials.json](references/materials.json), [components.json](references/components.json), and
   the matching resource/dataset references when the material consumes host data. Prefer the online
   MCP authoring context and template when available; otherwise use the optional local template index.
3. Clarify whether the request creates a new material or revises an existing one. For a revision,
   preserve its `type`, `tagName`, event names, public props, and document compatibility unless the
   user explicitly approves a breaking change. For a new material, use a unique host namespace such
   as `{{HOST_ID}}.<name>` and a lowercase custom-element tag such as `{{HOST_ID}}-<name>`.
4. Write a complete manifest and implementation in the configured source root. Keep all manifest,
   descriptor, event, and adapter values JSON-safe. Use only the selected public framework route;
   do not import Base Screen internals or access a private Engine store.
5. For design-time creation, use the `draft-only` workflow: create source, a focused test, the
   complete manifest, and a `material-candidate.json` with `status: "pending-review"`,
   `registration: "draft-only"`, stable host-namespaced `type`/`tagName`, and safe relative
   `sourcePath`/`testPath`. Do not edit the configured registration file or plugin manifest in this
   mode. The host must build, test, review, and accept the candidate before writing a
   `draft-material-catalog.json` for one screen draft.
6. If [material-provenance.json](references/material-provenance.json) exists, treat `online` entries
   as read-only compatibility references. Only `code` entries marked editable and covered by the
   workspace allowlist may be revised.
7. Run the generated preflight validator before changing registration. For a new material, use the
   catalog duplicate check; for a targeted revision, pass the existing type explicitly:

   ```text
   node scripts/validate-material-definition.mjs --manifest <manifest.json> --catalog references/materials.json
   node scripts/validate-material-definition.mjs --manifest <manifest.json> --catalog references/materials.json --allow-existing-type <type>
   ```

   Stop on any diagnostic. Fix the manifest or source rather than weakening the validator.
8. Add a focused test in the configured test root. Cover initial model rendering, prop/style defaults,
   data-ready and data-error states when applicable, declared event payloads, and adapter behavior.
   Do not test through private Shadow DOM or host services.
9. Follow the registration policy in `workspace.json` for formal code materials:
   - `propose` (the safe default): stage source and tests, keep the configured registration file and
     plugin manifest unchanged, and report the exact target files plus a unified diff. A later explicit
     user request may apply that proposal only after rechecking the target contents.
   - `apply`: after source and tests pass preflight, update exactly the configured registration target.
     For standalone mode, call the definition's explicit `define()` result and export the named
     registration function. For plugin mode, add only the material contribution to the named plugin
     manifest and keep activation in the host Plugin Manager.
   Never enumerate `customElements` or load a module from document data.
10. Run only the declared verification scripts through the configured package manager. If an apply
   operation fails, restore every registration target and leave the previous catalog state unchanged.
11. Audit `git diff --name-only` against `allowedFiles` in `workspace.json`; in `propose` mode also
   verify that registration targets are unchanged. Stop if an unrelated file changed. Report the
   material identity, framework, changed files, checks, registration proposal or application result,
   and remaining host follow-up. The host must refresh its dashboard Skill snapshot after a catalog
   change.

## Data and security rules

- A Screen Document persists material `type`, never a tag name, constructor, module path, or package
  URL. A manifest must declare stable `type`/`tagName` identity and complete defaults.
- Host-resource data uses literal parameter values and declared binding roles. Do not put URLs, SQL,
  headers, cookies, tokens, credentials, service objects, or live rows in source metadata or docs.
- Version resources are immutable assets bound to a material version. A material may reference only
  resource keys that exist in the current version, and only through the documented
  `useMaterialResource(key)` runtime API. Never invent keys, embed file URLs, or reference files
  outside the version; missing resources must be reported to the user before any apply.
- Use sanitized samples only to select layout, field roles, and value ranges. Never copy sample rows
  into defaults unless the request explicitly asks for static example content.
- Events are declared manifest names with bounded JSON payloads and `base-screen-material-event`
  dispatch. The renderer, not the event payload, supplies component identity and permissions.
- `editorDescriptor` is declarative JSON. It may name built-in controls and canonical paths, but it
  may not contain components, functions, DOM nodes, promises, code, or host services. Complex source,
  ECharts, and domain editors belong to the host authoring bridge.
