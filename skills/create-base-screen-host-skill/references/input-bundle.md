# Host canonical snapshot

The generator accepts the single canonical snapshot file written by the coordinator as
`.base-screen/host-snapshot.json`. It contains exactly these top-level fields:

## `host`

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

`hostId` is lowercase ASCII with hyphens, 1–40 characters. The generated Skill is named
`design-<hostId>-screens`. `hostName` and `locale` are non-empty display strings. `defaultCanvas`
uses the canonical Screen Canvas shape and is checked by the Contracts parser.

## `materials`

An array of JSON-safe `BaseScreenMaterialManifest` values. Include registered materials even when
`libraryVisible` is false if the model may need them as container parents.

## `resourceTypes`

An array of `dataResourceType` contribution values. Each entry contains `id`, `name`, and
`configSchema`; `queryScope` may be `resource`. The generator validates each entry through the Plugin
Core manifest parser.

## `datasets`

An array of `ScreenDatasetDescriptor` values. A descriptor is identified by its `resourceType` and
`resourceId`; its parameter names must match the resource type `configSchema`.

## `datasetSamples` (optional)

Each item has this wrapper:

```json
{
  "resourceType": "metrics",
  "resourceId": "daily-sales",
  "classification": "sanitized",
  "dataset": {
    "fields": [],
    "rows": []
  }
}
```

Samples must be sanitized before export. The generator checks the declaration, shape, field
identity, and size; the declaration is not a substitute for the host's privacy review.

## `screenGuidelines`

The host's durable design rules in plain text: brand colors, typography, spacing, canvas zones,
alignment rules, density preferences, allowed visual hierarchy, and language conventions. Do not put
credentials, connection details, transport configuration, or private records in this field.

The remaining fields (`materialGuidelines`, `materialAuthoring`, `components`,
`materialProvenance`, `materialTemplates`) are used by the material Skill generator. This generator
validates templates for shared snapshot safety but does not copy their contents.

## Bounds and safety

- Snapshot file: at most 12 MiB total.
- `screenGuidelines`: at most 64 KiB.
- Each sample: at most 50 rows and 64 KiB; all samples together: at most 1 MiB.
- All catalog values must pass the existing Contracts or Plugin Core parsers. Unknown fields fail
  closed.
- The generator reads no files outside the snapshot allowlist, never calls a live catalog or
  resource port, and never changes a material registration file.
