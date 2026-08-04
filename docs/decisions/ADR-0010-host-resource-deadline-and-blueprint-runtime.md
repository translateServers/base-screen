# ADR-0010: Host Resource Deadline And Blueprint Runtime

> Status: Accepted
> Date: 2026-08-04
> Scope: Renderer resource deadline ownership, Blueprint data evaluation, and capability gating
> Supersedes: [ADR-0007](./ADR-0007-host-resource-and-blueprint-runtime.md)
> Implements: [Host Resource And Blueprint Spec](../specs/host-resource-blueprint/spec.md), [Contracts Foundation Spec](../specs/contracts-foundation/spec.md)

## Decision

1. Renderer owns a per-resolution presentation deadline. `resourceTimeoutMs` defaults to
   15,000 ms and accepts only 100..60,000 ms. The host retains authorization, transport,
   retry, cache, deduplication, and observability ownership.
2. Every host-resource resolution uses its own `AbortController`, deadline timer, and
   component request generation. Deadline aborts the signal and writes only fixed
   `HOST_RESOURCE_TIMEOUT`; host throw/rejection maps to `HOST_RESOURCE_FAILED`; invalid or
   oversized success JSON maps to `HOST_RESOURCE_INVALID`.
3. Replacement, removal, `clear()`, and `dispose()` are silent lifecycle cancellation. They
   abort the relevant signal and suppress later model/error writes and error events.
4. `ScreenBlueprint` has one strict canonical shape. It supports bounded data expressions,
   optional conditions, and explicit capability requirements without compatibility branches,
   implicit upgrades, or field defaulting.
5. Blueprint expressions are limited to literal, event-payload path, variable, array, and
   object forms. Evaluation returns detached JSON, never invokes getters or functions, and
   rejects dangerous path segments, missing values, excessive depth/container count, and
   excessive result bytes with stable diagnostics.
6. Conditions use a fixed operator set, do not coerce values, execute rules/actions in
   canonical order, and commit neither variable changes nor host-event intents when
   evaluation fails.
7. Rule capabilities are explicit stable ids. The compiler accepts a readonly capability
   index and fails the complete plan closed when required capability is unavailable. Plugin
   contributions provide only allowlist and configuration-validation metadata.
8. Contracts owns the canonical parser, diagnostics, serializer, and committed JSON Schema
   golden. Core owns compile/evaluate; Renderer owns DOM-facing resource lifecycle; Plugin
   Manager owns per-instance active-contribution snapshot creation.

## Consequences

- A hanging host resource has bounded UI behavior without silently changing host transport
  policy.
- Blueprint remains a single portable, data-only contract without executable code.
- New public types, diagnostics, and JSON Schema updates require contract tests and API report
  review.
