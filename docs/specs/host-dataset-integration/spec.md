# Host Dataset Integration Spec

> Status: Active
> Updated: 2026-08-08
> Authority: [ADR-0023](../../decisions/ADR-0023-host-dataset-resource-integration.md)
> Related: [Contracts Foundation](../contracts-foundation/spec.md),
> [Host Resource And Blueprint](../host-resource-blueprint/spec.md),
> [Designer Full Product](../designer-full-product/spec.md)
> Tasks: [tasks.md](./tasks.md)
> Acceptance: [checklist.md](./checklist.md)
> Matrix: [test-matrix.md](./test-matrix.md)

## Goal

Complete the host-owned dataset workflow from catalog discovery through parameter and field binding,
Designer preview, and Viewer runtime refresh without storing transport details or credentials in Base
Screen state.

## Requirements

### R1 Contracts

The canonical host-resource source SHALL use literal/variable parameter unions and nullable field
binding. The parser and JSON Schema SHALL be strict, detached, and fail closed. The tabular dataset
contract SHALL enforce its field, row, byte, identifier, cell, date, and finite-number limits.

### R2 Host adapter

The Designer host adapter SHALL validate a dataset catalog capability and matching port. Listing SHALL
support an opaque cursor and bounded page size. Descriptions SHALL expose only safe display metadata,
fields, and parameter editor metadata. Resource requests SHALL carry evaluated JSON parameters only.

### R3 Core and materials

Core SHALL provide pure parameter evaluation, dependency extraction, and binding validation. Plugin
Core SHALL validate serializable material role declarations and keep executable adapters in trusted
runtime catalog entries. Official table and chart materials SHALL project validated tabular data under
their declared role constraints.

### R4 Viewer runtime

Viewer SHALL resolve static and host-backed variables before querying resources, query only when all
dependencies are available, and guard every result with cancellation, timeout, generation, and current
resource identity. It SHALL expose `variablePort` and `refreshData(componentId?)`.

### R5 Designer authoring

Designer SHALL consume the host adapter's variables, dataset catalog, and resource ports. Its data pane
SHALL first distinguish no data, static data, and host-managed datasets. The dataset workflow SHALL
surface catalog/query connection state, automatically restore the descriptor for an existing binding,
and support search/load-more, descriptor display, literal/variable parameter controls,
material-specific field roles, preview, and refresh. Valid edits SHALL enter Core transactions and
history; invalid edits SHALL not modify the document.

### R6 Harness and quality

The browser harness SHALL demonstrate a host catalog, variable parameter, table and chart bindings,
variable-triggered requery, manual refresh, safe failures, timeout/cancellation, and independent
instances. The test matrix SHALL map each requirement to focused automated evidence and required
package quality gates.

## Non-goals

- Polling, pagination, runtime sorting or filtering, event-context parameters, or scheduled queries.
- URL, SQL, header, token, cookie, fetch configuration, or credential persistence.
- Field binding for text or image materials in the first workflow.
