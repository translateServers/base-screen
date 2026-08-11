# Host snapshot bundle

The generator accepts one directory containing only these files:

## `host.json`

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

## Catalog files

- `materials.json` is an array of JSON-safe `BaseScreenMaterialManifest` values. Include registered
  materials even when `libraryVisible` is false if the model may need them as container parents.
- `resource-types.json` is an array of `dataResourceType` contribution values. Each entry contains
  `id`, `name`, and `configSchema`; `queryScope` may be `resource`. The generator validates each entry
  through the Plugin Core manifest parser.
- `datasets.json` is an array of `ScreenDatasetDescriptor` values. A descriptor is identified by its
  `resourceType` and `resourceId`; its parameter names must match the resource type `configSchema`.
- `dataset-samples.json` is optional. Each item has this wrapper:

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

## `design-guidelines.md`

Write the host's durable design rules in plain text: brand colors, typography, spacing, canvas zones,
alignment rules, density preferences, allowed visual hierarchy, and language conventions. Do not put
credentials, connection details, transport configuration, or private records in this file.

## Bounds and safety

- `design-guidelines.md`: at most 64 KiB.
- Each sample: at most 50 rows and 64 KiB; all samples together: at most 1 MiB.
- All catalog values must pass the existing Contracts or Plugin Core parsers. Unknown fields fail closed.
- The generator reads no files outside the bundle allowlist and never calls a live catalog or resource port.
