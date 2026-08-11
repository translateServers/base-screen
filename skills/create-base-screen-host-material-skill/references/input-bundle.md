# Host material authoring bundle

The generator accepts one directory containing only these files:

## `host.json`

Use the same host identity shape as the dashboard Skill generator:

```json
{
  "hostId": "acme",
  "hostName": "Acme Operations",
  "locale": "zh-CN",
  "defaultCanvas": {
    "width": 1920,
    "height": 1080,
    "backgroundColor": "#07111f"
  }
}
```

The canvas is retained as host context for material preview examples and is checked by the Contracts
parser. The child Skill name is `create-<hostId>-material`.

## `material-authoring.json`

This file is the only source of workspace write authority:

```json
{
  "framework": "native",
  "workspace": {
    "rootMarker": "package.json",
    "packageManager": "pnpm",
    "verificationScripts": ["typecheck", "test"]
  },
  "roots": {
    "source": "src/materials",
    "tests": "tests/materials"
  },
  "registration": {
    "mode": "standalone",
    "file": "src/materials/register.ts",
    "exportName": "registerAcmeMaterials"
  },
  "allowedFiles": [
    "src/materials/**",
    "tests/materials/**",
    "src/materials/register.ts"
  ],
  "referenceSourcePaths": ["src/materials/text.ts"]
}
```

`framework` is exactly one of `native`, `react`, or `vue`; the generated child Skill contains only
that framework route. `registration.mode` is `standalone` or `plugin`. Plugin registration also
requires `pluginManifestFile`, which must be listed in `allowedFiles`. `rootMarker` must be a file
at the workspace root. Verification entries are script names, not shell commands; the child Skill
invokes them through the declared package manager.

Every path is workspace-relative, uses `/`, contains no `..`, drive letter, URL, wildcard except a
final `/**`, or control character. `allowedFiles` must cover both roots, the registration file, and the
plugin manifest file when present. Reference paths are read-only and are never written by the child
Skill.

## `material-guidelines.md`

Keep durable implementation rules here: naming, typography, colors, accessibility, CSS isolation,
event conventions, preferred data adapters, and review expectations. Do not include credentials,
connection details, source URLs, private records, tokens, or executable code.

## `components.json`

This is a sanitized index of reusable host components. It is metadata, not executable source:

```json
[
  {
    "id": "status-card",
    "name": "Status card",
    "framework": "native",
    "sourcePath": "src/components/status-card.ts",
    "exportName": "StatusCard",
    "role": "reference",
    "notes": "Use for compact KPI cards."
  }
]
```

`role` is `reference` or `wrapper`; each id and source path is unique, and the framework must match
the selected authoring route.

## Catalog and data files

- `materials.json` is an array of JSON-safe `BaseScreenMaterialManifest` values. Existing materials
  are references for identity and compatibility; they are not copied or overwritten.
- `resource-types.json` is an array of `dataResourceType` contributions and is validated by the
  Plugin Core parser.
- `datasets.json` is an array of `ScreenDatasetDescriptor` values. Parameter names must match the
  selected resource type `configSchema` exactly.
- `dataset-samples.json` is optional. Each item has `resourceType`, `resourceId`,
  `classification: "sanitized"`, and a bounded `dataset` parsed by Contracts. Samples never grant
  write or network authority.

## Bounds and safety

- `material-guidelines.md`: at most 64 KiB; catalog files: at most 4 MiB; resource types: at most
  2 MiB; samples: at most 1 MiB total, 50 rows and 64 KiB per sample.
- The bundle allowlist is strict and unknown fields fail closed.
- The generator reads no files outside the bundle and never runs host verification scripts while
  validating a snapshot.
