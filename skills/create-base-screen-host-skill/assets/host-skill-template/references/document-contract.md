# Screen Document authoring contract

The output must be one strict JSON object with exactly these top-level fields:

```json
{
  "canvas": { "width": {{CANVAS_WIDTH}}, "height": {{CANVAS_HEIGHT}}, "backgroundColor": "{{CANVAS_BACKGROUND}}" },
  "components": [],
  "variables": [],
  "blueprint": { "relations": [] }
}
```

Each component contains `id`, `type`, `name`, `parentId`, `position`, `size`, `rotation`, `zIndex`,
`status`, `props`, `style`, and `dataSource`. `parentId` is either `null` or another component ID.
Use a parent only when that material declares `designCapabilities.children: true`.

Use one of these data sources:

```json
{ "type": "static", "value": "..." }
```

```json
{
  "type": "dataset",
  "datasetId": "publication:daily-sales",
  "params": { "range": { "kind": "literal", "value": "30d" } },
  "binding": { "fields": { "dimension": ["date"], "measures": ["sales"] } }
}
```

Use only props and style values accepted by the selected manifest schemas. Keep component IDs unique,
keep dataset parameters literal, leave `variables` empty, and leave `blueprint.relations` empty. The
validator checks the full canonical parser, material catalog, dataset parameters and fields, and
binding roles.
