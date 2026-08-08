# ADR-0022: Official Data Material Contracts

> Status: Accepted
> Date: 2026-08-07
> Scope: Minimal official chart and table data semantics

## Decision

Base Screen owns the minimal cross-material data semantics for official chart and table materials.
The contract is published by `@base-screen/plugin-core` and is consumed by official and third-party
materials through that public package boundary.

The first contract contains:

- table columns, row objects, value types, and capability flags for sorting/filtering;
- chart series and numeric points;
- strict JSON parsing, unique identifiers, and detached output.

The contract does not contain chart-library options, DOM or canvas details, query transport, pagination
state, filtering state, selection state, formatting callbacks, or designer controls. Those capabilities
require separate contracts and Specs.

`@base-screen/material` may provide official implementations, but it does not own the shared semantic
types. `@base-screen/renderer` only transports data through the Material Model and does not interpret
chart or table semantics.

## Rationale

Without an official semantic contract, chart and table materials can be mounted but cannot reliably
interoperate through Blueprint, host resources, or future Designer features. Keeping the first contract
small avoids coupling the platform to a rendering library while establishing stable meanings for rows,
columns, series, and points.
