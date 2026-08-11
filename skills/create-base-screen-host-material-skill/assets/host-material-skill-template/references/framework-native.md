# Native Custom Element route

Implement a class extending `HTMLElement` with a static `manifest`, a complete `model` getter/setter,
and an explicit `createMaterialDefinition({ manifest, element })` call. The setter must update the
rendered view atomically; do not encode the model through attributes. Dispatch declared events only
when the model is interactive and the payload passes the JSON boundary.

If tabular data needs normalization, expose a static `tabularDataAdapter` data property with an
`adapt({ dataset, fields })` method returning `ScreenParseResult<ScreenJsonValue>`. Register through the
host's explicit function, never by scanning the browser registry.
