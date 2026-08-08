# ADR-0023: Host Dataset Resource Integration

> Status: Accepted
> Date: 2026-08-07
> Scope: Host dataset catalog, parameter binding, tabular data projection, and runtime refresh
> Extends: [ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md),
> [ADR-0017](./ADR-0017-designer-product-host-boundaries.md),
> [ADR-0018](./ADR-0018-host-intents-assets-and-graph-blueprint.md),
> [ADR-0022](./ADR-0022-official-data-material-contracts.md)

## Context

The existing `host-resource` source records an opaque resource identity, but its parameter shape is
currently indistinguishable from arbitrary JSON and the Renderer forwards the complete source to the
host. That prevents a host-owned dataset catalog from safely driving Designer authoring and makes
field mapping and variable dependencies runtime concerns outside the canonical contract.

API、数据库、全局状态和其他数据基础设施是宿主的实现选择。随着来源增多，让 Designer
分别持有 URL、SQL、连接信息或宿主状态路径会把宿主架构泄露进 Screen Document，也会让每种
来源重复实现发现、参数和字段映射界面。因此数据集是宿主对这些来源的统一管理视图，而不是
Base Screen 新增的一种传输协议。

Base Screen needs one narrow data flow:

`host dataset catalog -> parameter authoring -> field binding -> Designer preview -> Viewer resolve`.

The host remains the owner of authentication, real queries, authorization, auditing, caching, and
transport details. Base Screen only stores the resource identity, literal/variable parameter intent,
and material field mapping.

## Decision

### Canonical resource source

`ScreenHostResourceDataSource` has exactly one current shape:

```ts
interface ScreenHostResourceDataSource {
  readonly type: 'host-resource';
  readonly resourceType: string;
  readonly resourceId: string;
  readonly params: Readonly<Record<string, ScreenHostResourceParameter>>;
  readonly binding: ScreenHostResourceBinding | null;
}

type ScreenHostResourceParameter =
  | { readonly kind: 'literal'; readonly value: ScreenJsonValue }
  | { readonly kind: 'variable'; readonly name: string };

interface ScreenHostResourceBinding {
  readonly fields: Readonly<Record<string, readonly string[]>>;
}
```

There is no legacy `params: ScreenJsonObject` branch. Parsers, schema, fixtures, examples, and public
documentation use only the strict shape and fail closed on unknown fields.

### Unified dataset contract

The Contracts package owns the detached, JSON-safe tabular response:

```ts
interface ScreenTabularDataset {
  readonly fields: readonly ScreenDatasetField[];
  readonly rows: readonly ScreenJsonObject[];
  readonly totalRowCount?: number;
}

interface ScreenDatasetField {
  readonly id: string;
  readonly label: string;
  readonly valueType: 'string' | 'number' | 'boolean' | 'date';
}
```

Responses are limited to at most 256 fields, 10,000 rows, and 1 MiB. Field IDs are unique; rows may
only contain declared fields; cells are a matching scalar or `null`; numbers are finite; dates are
ISO strings. `totalRowCount` is metadata only and does not enable pagination.

### Host catalog and request boundary

Contracts owns `ScreenHostDatasetCatalogPort` with abort-aware `list` and `describe` methods. Dataset
descriptors contain display metadata, declared fields, and parameter editor metadata, but never
transport information or credentials. List cursors are opaque to Base Screen and default to 50 items.

`ScreenDesignerHostAdapter` gains a `datasetCatalog` capability and port. A dataset may be selected
only when that capability is valid; Designer preview additionally requires the existing `resources`
capability.

Designer 将数据入口展示为 `none`、`static` 与宿主管理的数据集。宿主数据集背后的来源可以是
API、数据库、全局状态或其他系统，但这些来源类型不进入 canonical document，也不成为
Designer 的传输配置表单。`datasetCatalog` 负责发现和描述，`resources` 负责按稳定资源标识查询。

`ScreenHostResourceRequest` contains only `componentId`, `resourceType`, `resourceId`, and evaluated
ordinary JSON parameters. Binding declarations and variable references never cross the host port.

### Runtime ownership

Core owns pure parameter evaluation, dependency extraction, detached JSON cloning, and material-role
binding validation. Missing variables, host variable failures, unknown fields, and role/type
violations fail closed before a resource request is made.

Renderer and Viewer own per-instance variable state, host variable resolution, request cancellation,
15-second default deadlines, generation guards, and late-result suppression. Data is requested on
initial load, when a referenced variable changes, and on explicit refresh. Polling, pagination,
runtime sort/filter, and cross-component cache are out of scope.

`refreshData()` refreshes all resources; `refreshData(componentId)` refreshes one component. Repeated
same-instance refreshes for the same component are coalesced. Hosts retain responsibility for
cross-component caching and server-side deduplication.

### Material declarations

Plugin Core owns a serializable Manifest declaration for row/column binding roles and a trusted,
runtime-only data adapter on catalog entries. Functions are never placed in a Manifest or Screen
Document. Official table materials declare one `columns` role accepting 1..256 fields. Official chart
materials declare one `dimension` and 1..8 numeric `measures`; null measures are skipped and type
mismatches fail closed.

Materials without a binding declaration retain existing static and raw host-resource behavior.

## Consequences

- Host integrations can expose datasets without leaking URL, SQL, headers, tokens, or request options.
- A canonical document fully describes parameter intent and field projection while remaining host-neutral.
- Dataset responses have one validation boundary before material-specific projection.
- Designer and Viewer can share deterministic variable dependency behavior without a global store.
- Hosts must implement catalog descriptions and validate every evaluated parameter, tenant, permission,
  and publication state on every request.

## Rejected Alternatives

### Keep arbitrary JSON parameters

Rejected because the document cannot distinguish a safe literal from an unresolved runtime value, and
the host boundary would continue to receive authoring-only state.

### Send binding and variable references to the host

Rejected because field projection belongs to Base Screen and references reveal document internals that
are not part of the host query contract.

### Put adapter functions in a Manifest

Rejected because manifests and documents must remain serializable data; executable behavior belongs to
trusted runtime catalog entries.

### Add polling or query controls to the first contract

Rejected because it expands lifecycle, authorization, and cancellation semantics beyond the initial
parameterized query workflow.

## Verification

- Contracts tests cover strict resource parsing, dataset limits/types, adapter capability matching,
  schema golden output, and serialization round trips.
- Core tests cover parameter evaluation, dependencies, and role binding validation.
- Plugin Core and Material tests cover role declarations and official table/chart projection.
- Renderer/Viewer tests cover variable ordering, targeted refresh, cancellation, timeout, and stale
  response protection.
- Engine DOM and browser harness tests cover catalog selection, parameter controls, field roles,
  preview, refresh, keyboard access, and instance isolation.
