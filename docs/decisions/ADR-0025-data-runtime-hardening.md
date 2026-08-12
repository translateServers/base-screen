# ADR-0025: Data Runtime Hardening

> Status: Accepted
> Date: 2026-08-09
> Scope: Host dataset boundary, request identity and sharing, dataset metadata, data states and diagnostics, initialization/parameter/variable chain, execution context and observer events, one-time legacy migration
> Extends: [ADR-0023](./ADR-0023-host-dataset-resource-integration.md), [ADR-0022](./ADR-0022-official-data-material-contracts.md), [ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md)
> Supersedes (in part): [ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md), [ADR-0023](./ADR-0023-host-dataset-resource-integration.md) - only the in-flight cross-component dedup assignment
> Implements: [Data Runtime Hardening Spec](../specs/archive/data-runtime-hardening/spec.md)
> XJ counterpart: the XJ Data Hub repository holds the active XJ Data Runtime Hardening Spec at
> `.agent/specs/data-runtime-hardening/spec.md` (active since 2026-08-09); its acceptance and transfer
> records live in the XJ Data Hub `.agent/specs/` tree

## Context

ADR-0023 established host-managed datasets, the strict host-resource source, and the canonical tabular
dataset contract. ADR-0010 established per-resolution deadline and cancellation ownership. Real
integration with the XJ Data Hub host exposed correctness gaps the original decisions left open or
assigned elsewhere:

1. The document contract, the host Schema, and the document factories across the two repositories
   disagree, and no single current form is enforced everywhere.
2. Renderer reconciliation can cancel unchanged in-flight requests for the same resource, and the
   Viewer's targeted refresh path can degrade into a full refresh.
3. It is undefined whether `componentId` has semantic meaning to a host query, and under what rule
   multiple components referencing the same dataset may share one in-flight request. ADR-0010 and
   ADR-0023 assign deduplication ownership to the host without defining a Base Screen coordination
   model.
4. The XJ host persists two binding representations (the canonical field binding and a legacy
   `configJson` binding), and its documents still carry legacy numeric metric IDs.
5. Dataset metadata is limited to identity and value type; real hosts need nullable, unit, and format
   without opening an arbitrary JSON channel.
6. Material consumers cannot distinguish an empty dataset from a failed query, and aborts surface
   ambiguously.
7. Initialization order, parameter-schema authority, and Designer/Viewer variable parity are implicit
   rather than contractually frozen.

This ADR is deliberately scoped to data runtime hardening. It does not re-open the host-managed dataset
direction and does not turn Base Screen into a connection manager, query engine, or transport runtime.

## Decision

### 1. Host-managed datasets and the canonical document boundary

Base Screen continues the host-managed dataset model. The Screen Document SHALL store only the resource
identity (`resourceType`, `resourceId`), the parameter intent (literal or variable), and the field
binding. Credentials, URLs, SQL, headers, connection configuration, and transport options SHALL NOT be
stored in documents, and Base Screen SHALL NOT become a database connection manager.

The contracts parser and JSON Schema SHALL keep exactly one current shape with no legacy parser branch.
Unknown fields, missing `binding`, or legacy parameter shapes fail closed. Runtime code SHALL NOT
silently accept or convert legacy document shapes.

### 2. Request identity and explicit sharing opt-in

`componentId` SHALL be audit-only for every query. It carries no semantics for the host query
identity and SHALL NOT be part of a shared request key.

The raw query identity SHALL be `resourceType + resourceId + canonical evaluated params`. Field binding
and material adaptation SHALL form a separate projection identity: a binding change re-runs the local
projection without re-issuing the host query, as long as the raw identity is unchanged.

Cross-component sharing of an in-flight request SHALL NOT be assumed. A resource type SHALL explicitly
opt in to same-instance, in-flight cross-component sharing. The exact declarative shape is the optional
resource contribution field `queryScope?: 'resource'`; absence SHALL mean component-scoped, i.e. no
sharing. `queryScope` is declarative only: it enables in-flight sharing for the declared resource type
and carries no other runtime meaning. When sharing is enabled, only requests with an identical raw query
identity may share.

### 3. In-flight-only, instance-local sharing lifecycle

Sharing SHALL happen only inside one Renderer/Viewer instance and only while a request is in flight.
This model introduces no completed-result cache: a completed dataset is delivered to each consumer and
then released.

Every consumer SHALL independently validate its binding and run its own material adapter. A consumer
leaving SHALL only remove its own subscription. The host request SHALL be aborted only when the last
consumer leaves. Timeout and failure SHALL distribute one consistent terminal state to all current
consumers.

### 4. One-time legacy numeric-ID migration

The XJ host SHALL migrate legacy numeric metric IDs exactly once. After the migration completes, the
numeric-ID read branch SHALL be removed from runtime code; only the current stable identity remains.

Historical documents that cannot be mapped to the current identity SHALL produce blocking findings and
SHALL NOT be guessed or written back with fabricated mappings.

Production migration execution, backup, deployment, smoke, and observation are explicitly outside the
current authorized execution. In this execution, only the migration code, tests, dry-run, and rollback
rehearsal are in scope.

### 5. Alerts are a separate host dataset

Alerts SHALL be exposed as a separate host dataset resource, not as a generic annotation protocol over
the tabular dataset contract. The public tabular dataset contract SHALL NOT absorb host-private alert
shapes or annotation fields.

### 6. Public dataset metadata surface

The public dataset field metadata SHALL be limited to:

```ts
interface ScreenDatasetField {
  readonly id: string;
  readonly label: string;
  readonly valueType: 'string' | 'number' | 'boolean' | 'date';
  readonly nullable?: boolean;
  readonly unit?: string;
  readonly format?: string;
}
```

`semanticType` SHALL NOT be added. An omitted `nullable` SHALL preserve the current permissive null
behavior (cells may be null or missing). `nullable: false` SHALL reject null and missing cells. `unit`
SHALL be a nonempty display hint of 1..64 UTF-16 code units; `format` SHALL be a nonempty display hint of
1..128 UTF-16 code units; both SHALL reject C0/C1 control characters. `format` SHALL be a display hint
only and SHALL NEVER be executable.

### 7. Data states and safe diagnostics

Empty data SHALL be ready data with zero rows - not an error and not a new data-state status. Active
abort SHALL be lifecycle-only and SHALL NOT surface as a material error; abort has no material-facing
code.

The public, material-facing terminal code set SHALL be frozen to exactly:

```ts
'HOST_RESOURCE_ACCESS_DENIED'
'HOST_RESOURCE_UNAVAILABLE'
'HOST_RESOURCE_TIMEOUT'
'HOST_RESOURCE_FAILED'
'HOST_RESOURCE_INVALID'
'HOST_DATASET_INVALID'
'HOST_DATASET_BINDING_INVALID'
'HOST_DATASET_ADAPTER_FAILED'
```

A host safe-failure input SHALL be constrained to exactly one of these codes, plus an optional public
message of at most 256 UTF-16 code units that rejects C0/C1 control characters. It SHALL NOT carry
arbitrary raw diagnostics, paths, or parameter payloads. Unknown or invalid host failure codes SHALL
normalize to `HOST_RESOURCE_FAILED`. An unrecognized host code is not an accepted safe-failure input,
so its raw message is discarded along with the code, and the normalized output carries the stable
default for `HOST_RESOURCE_FAILED`.

Third-party materials SHALL pass conformance tests proving they handle every state safely.

### 8. Initialization, parameters, variables, execution context, and observer events

The hardening scope SHALL include:

- Atomic configuration: the Viewer and the Designer SHALL each expose an authoritative `configure()`
  entry point that validates every runtime dependency (catalog, runtime contributions, resource and
  variable ports, timeout, host adapter) before committing configuration or creating a Renderer. Runtime
  dependency setters SHALL no longer initialize independently; in-repo and XJ callers SHALL migrate to
  `configure()`. Document updates remain an explicit post-configuration operation. No compatibility
  parser or ordering shim SHALL be invented.
- Descriptor authority: `ScreenDatasetParameter` SHALL retain only `name`, `label`, optional `editor`,
  and optional `defaultValue`; `valueType` and `required` SHALL be removed. Parameter names SHALL match
  `configSchema` properties exactly; `editor` and `defaultValue` SHALL validate against the schema.
  Optional parameters SHALL have unset/literal/variable authoring states, and only present items persist.
- Config-schema parameter authority: the resource type's `configSchema` is the authority for parameter
  structure and constraints; descriptor metadata only supplements labels, editors, and defaults and must
  map one-to-one to the schema.
- Designer/Viewer variable parity: both use the same dependency extraction and parameter evaluation so
  the same variables and document produce the same query parameters. Host variables SHALL be checked
  against the resolved runtime snapshot; no new persisted variable typing SHALL be added.
- Refresh/context API: `refreshData(componentId?: string)` SHALL be retained as the manual shorthand for
  current public consumers, and an object form `refreshData({ componentId?, trigger?: 'manual' |
  'polling', traceId? })` SHALL be added. This is a concrete public compatibility need, not a
  document-shape compatibility branch. Initial, variable, and document-change triggers are
  runtime-owned.
- Execution context: `ScreenResourceExecutionContext` SHALL be a contract with `instanceId`, `mode`
  (design/preview/viewer), `trigger` (initial/manual/polling/variable/document-change), and `traceId`,
  plus optional `projectId` and `documentRevision`, supplied per resolution and never persisted into the
  Screen Document.
- Observer contract: `ScreenResourceObserver` SHALL be a contract whose event types are
  `started`, `shared`, `succeeded`, `failed`, `aborted`, `timed-out`, and `adapted`. Events SHALL carry
  only a request ID, component/resource identity, execution context, duration, optional field/row
  counts, and the stable code; they SHALL NEVER carry parameters, dataset payloads, or messages. Observer
  exceptions SHALL be isolated and SHALL NOT break resolution.

### 9. Execution scope of the hardening effort

Production backup, migration execution, deployment, smoke, and observation are out of this execution.
Code, tests, migration dry-run, and rollback rehearsal are in scope. No completion claim for runtime
behavior is accepted without automation evidence, including real browser E2E and query-count proof.

## Relationship To Prior Decisions

ADR-0010 item 1 and ADR-0023's runtime-ownership paragraphs assign cache and deduplication ownership to
the host without defining a Base Screen coordination model. This ADR supersedes only that portion:
same-instance, in-flight cross-component deduplication of opted-in resource types becomes a Base Screen
coordination responsibility under the rules in sections 2 and 3. Everything else in ADR-0010 and
ADR-0023 - host ownership of transport, authorization, retry, server-side caching, and server-side
deduplication, per-resolution deadlines, cancellation semantics, the strict resource source, and the
canonical dataset contract - remains in force. This ADR does not rewrite the history or conclusions of
ADR-0010 or ADR-0023.

## Security Boundaries

- Documents and fixtures never contain credentials, URLs, SQL, headers, or connection configuration.
- Request sharing never crosses Renderer/Viewer instances, so different users, tenants, or host
  configurations cannot observe each other's data.
- Identity changes (resource id, resource type, or evaluated params) immediately invalidate in-flight
  work; stale responses are suppressed.
- `nullable: false` is a contract-level guarantee on cells, not a security control.
- Diagnostics and observer events carry no sensitive payloads.
- The execution context is per-resolution and non-persistent; identity, tenant, and permission remain
  the host's authentication context.

## Compatibility And Migration Position

- The current document shape is the only shape. After the one-time XJ migration, no numeric-ID read
  branch remains.
- Unmappable historical documents are blocking findings; they are never guessed.
- Because only the current form remains, an application rollback after migration must restore the
  pre-migration database snapshot; rolling back frontend or backend artifacts alone is not sufficient.
- Public metadata additions (`nullable`, `unit`, `format`) are optional and backward compatible;
  omission preserves permissive behavior.

## Alternatives Considered

### Cross-component deduplication without an opt-in

Rejected because default sharing risks identity confusion and cross-component coupling. The explicit
`queryScope?: 'resource'` opt-in keeps the default safe and auditable.

### A completed-result cache

Rejected because it expands invalidation and isolation semantics beyond in-flight sharing and conflicts
with the no-cross-instance-data boundary.

### Alerts as an annotation protocol

Rejected because generic annotations leak host-private shapes into the public tabular contract and
complicate pagination, refresh, and table/chart consumption.

### Adding `semanticType` to metadata

Rejected because no frozen consumer or validation rule exists and it would reopen an arbitrary JSON
channel.

### Empty data as a distinct error state

Rejected because zero-row datasets are valid results; a new status would break materials and viewer
behavior without diagnostic benefit.

### A runtime legacy parser or compatibility branch

Rejected because it violates fail-closed parsing and keeps two document forms alive indefinitely.

## Verification

- Contract tests prove the strict single-shape parser, metadata limits (`nullable`, `unit`, `format`),
  and diagnostic bounds.
- Core tests prove parameter evaluation, variable parity, and binding/projection separation.
- Plugin Core and Material tests prove adapter ABI, metadata projection, and full state handling.
- Renderer tests prove deferred render retention, raw versus projection key behavior,
  shareable/non-shareable request separation, last-consumer abort, and the absence of a completed-result
  cache.
- Viewer tests prove initial/full/targeted/unknown refresh behavior and instance isolation.
- Engine tests prove atomic configuration, config-schema authority, and Designer/Viewer parity.
- XJ tests prove vendored schema sync, Factory/Agent output, canonical binding only, migration
  dry-run/rollback, and error safety.
- Real browser E2E and query-count proof are required before any runtime completion claim.
- The complete evidence map lives in the Data Runtime Hardening Spec test matrix. This ADR is accepted
  as of 2026-08-09; governance is accepted and implementation is in progress, and no completion claim
  for runtime behavior is accepted without automation evidence.
