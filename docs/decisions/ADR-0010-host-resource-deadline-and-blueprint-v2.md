# ADR-0010: Host Resource Deadline And Blueprint V2

> Status: Accepted
> Date: 2026-08-04
> Scope: Renderer resource deadline ownership, Blueprint V2 compatibility, data expression evaluation, and capability gating
> Supersedes: [ADR-0007](./ADR-0007-host-resource-and-blueprint-runtime.md)
> Implements: [Host Resource And Blueprint Spec](../specs/host-resource-blueprint/spec.md), [Contracts Foundation Spec](../specs/contracts-foundation/spec.md)

## Context

The original host-resource decision assigned timeout ownership to the host and limited Blueprint to static values. The runtime hardening work requires deterministic UI behavior when a host resolver never settles, and needs bounded event-payload and variable expressions without executable code. These are public runtime and document-contract changes and must be explicitly authorized.

## Decision

1. Renderer owns a per-resolution presentation deadline. `resourceTimeoutMs` defaults to 15,000 ms and accepts only 100..60,000 ms. The host retains authorization, transport, retry, cache, deduplication, and observability ownership.
2. Every host-resource resolution uses its own `AbortController`, deadline timer, and component request generation. Deadline aborts the signal and writes only fixed `HOST_RESOURCE_TIMEOUT`; host throw/rejection maps to `HOST_RESOURCE_FAILED`; invalid or oversized success JSON maps to `HOST_RESOURCE_INVALID`.
3. Replacement, removal, `clear()`, and `dispose()` are silent lifecycle cancellation. They abort the relevant signal and suppress later model/error writes and error events. Generation is the final write guard even if a host ignores cancellation.
4. `ScreenBlueprint` is a strict discriminated union on `apiVersion: 1 | 2`. V1 parsing, serialization, compilation, and semantics remain unchanged; it is never defaulted, upgraded, or stripped into V2.
5. V2 allows only bounded data expressions: literal, event-payload path, variable, array, and object. Evaluation returns detached JSON, never invokes getters or functions, and rejects dangerous path segments, missing values, excessive depth/container count, and excessive result bytes with stable diagnostics.
6. V2 may attach one strict condition to a rule. Conditions are data-only, use the fixed operator set, do not coerce values, execute rules/actions in canonical order, and commit neither variable changes nor host-event intents when evaluation fails.
7. V2 rule capabilities are explicit stable ids. The compiler accepts a readonly capability index and fails the complete plan closed when required capability is unavailable. Plugin contributions only form allowlist and configuration-validation metadata; they never carry handlers, resolvers, credentials, URLs, or ports.
8. Contracts owns the V1/V2 canonical parser, diagnostics, serializer, and committed JSON Schema golden. Core owns compile/evaluate; Renderer owns DOM-facing resource lifecycle; Plugin Manager owns per-instance active-contribution snapshot creation.

## Consequences

- A hanging host resource has bounded UI behavior without silently changing host transport policy.
- Persisted V1 documents remain portable and stable while V2 gains limited dynamic data.
- New public types, diagnostics, and JSON Schema updates require contract tests and API report review.

## Rejected Alternatives

### Renderer retry or cache

Rejected because those policies need host-specific authorization, freshness, and observability semantics.

### JavaScript or string expressions

Rejected because they introduce executable behavior and make portable documents unsafe.

## Verification

Tests cover timeout, all cancellation paths, late results, V1 equivalence, V2 data expression and condition failures, atomic behavior, and capability allowlisting.
