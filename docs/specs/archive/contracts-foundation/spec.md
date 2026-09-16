# Contracts Foundation Spec

> Status: Archived (historical acceptance record)
> Updated: 2026-08-04
> Authority: [ADR-0002](../../../decisions/ADR-0002-canonical-screen-document.md), ADR-0023

## Scope

`@base-screen/contracts` owns one current `ScreenDocument` contract plus its parser,
diagnostics, canonical serializer, JSON Schema artifact, host ports, and project envelope.
It has no workspace dependencies, DOM dependencies, registration side effects, or host I/O. The
Project Adapter requests, publish capability, opaque revision envelope, abort signal, and stable
`PROJECT_*` diagnostics are public host-port contracts defined by
[ADR-0012](../../../decisions/ADR-0012-designer-project-lifecycle.md).

The canonical root is strictly:

```ts
interface ScreenDocument {
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  readonly variables: readonly ScreenStaticVariable[];
  readonly blueprint: ScreenBlueprint;
}
```

`ScreenBlueprint` is required as one strict shape with a bounded rules array, bounded data
expressions, optional conditions, and explicit capability requirements under
[ADR-0010](../../../decisions/ADR-0010-host-resource-deadline-and-blueprint-runtime.md).
Components may have `null`, `static`, or `host-resource` data sources. A host-resource source has an
opaque resource identity, literal/variable parameter bindings, and an optional material field
binding. Project identity,
revision, metadata, credentials, transport details, and host-only policy are outside this
shape.

## Requirements

- `parseScreenDocument()` accepts only JSON-object inputs and returns detached JSON output.
- Every canonical object is strict. Unknown fields, missing fields, invalid primitive
  constraints, invalid JSON values, dangerous keys, prototype values, cycles, and resource
  limit violations fail closed with stable diagnostics.
- Parser behavior does not default fields, coerce values, trim strings, map aliases, or
  infer missing structure.
- Component IDs, parents, geometry, material types, variable names, and Blueprint references
  are validated deterministically.
- `parseScreenProjectEnvelope()` validates its own metadata boundary and prefixes nested
  document diagnostic paths with `document`.
- `serializeScreenDocument()` revalidates input and emits deterministic canonical JSON.
- `ScreenHostResourceDataSource` is exactly `{ type, resourceType, resourceId, params, binding }`, where each parameter is a literal JSON value or a document-variable reference; no legacy arbitrary JSON parameter form is accepted.
- `ScreenTabularDataset` validates at most 256 fields, 10,000 rows, and 1 MiB, with unique declared fields, declared row keys, matching scalar/null cells, finite numbers, and ISO date strings.
- `ScreenHostDatasetCatalogPort` exposes abort-aware bounded listing and safe descriptor lookup. The Designer adapter validates the capability/port relationship before use.
- `SCREEN_DOCUMENT_JSON_SCHEMA` and the published `screen-document.schema.json` artifact
  derive from the same schema source and are deeply equal.
- Public declarations expose TypeScript data types and parser APIs, not Zod implementation
  types or internal validation helpers.

## Non-goals

- Compatibility transforms, migration registries, legacy aliases, or speculative extension
  fields.
- Network transport, URL/header/token storage, scripts, SQL, or executable expressions.
- Material registration, Renderer/Designer behavior, project persistence policy, or external
  format parsing.

## Acceptance

- Minimal and nested documents parse and serialize deterministically without input mutation.
- Invalid document roots, strict-object extras, invalid JSON, limits, graph errors, and
  Blueprint reference errors return the documented diagnostics.
- Repeated parse/serialize operations produce equal values and bytes for equivalent input.
- The emitted schema is strict, includes the current root fields and bounds, and matches the
  committed artifact.
- A tarball consumer imports the contract package and artifact, parses a minimal document,
  and serializes it successfully.
