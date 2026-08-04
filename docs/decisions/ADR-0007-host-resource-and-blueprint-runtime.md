# ADR-0007: Host Resource And Blueprint Runtime

> Status: Superseded by [ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md)
> Date: 2026-08-04
> Scope: host-resource intent, restricted Blueprint rules, and runtime host ports
> Implements: [Host Resource And Blueprint Spec](../specs/host-resource-blueprint/spec.md)

## Decision

1. `blueprint: { rules: [] }` is a required field of the canonical
   Screen Document. It is a bounded data-only rule set, not executable code.
2. A `host-resource` source declares only `resourceType`, `resourceId`, and JSON `params`.
   It cannot persist URLs, methods, headers, tokens, cookies, or functions.
3. Blueprint may match an allowlisted material event, set a declared ephemeral variable,
   or emit a named host event. It cannot evaluate JavaScript, traverse arbitrary member
   paths, or call endpoints.
4. Core compiles Blueprint deterministically and evaluates events only through an injected
   runtime port. Renderer and Engine never execute Blueprint strings.
5. Renderer resolves a host resource only through an injected host resource port. It
   validates returned JSON, tracks each component request generation, and ignores stale or
   aborted responses after replacement, unmount, or disposal.

## Consequences

- Documents remain portable intent without persisted credentials or executable behavior.
- The host owns authorization, retry, cancellation, caching, observability, and transport.
- Blueprint and resource failure paths remain bounded and fail closed.
