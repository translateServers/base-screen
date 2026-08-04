# ADR-0007: Document V2 Host Resource And Blueprint Runtime

> Status: Accepted
> Date: 2026-08-04
> Scope: canonical document V2, host-resource intent, restricted Blueprint, migration, and runtime host ports
> Implements: Host Resource And DSL Runtime Spec

## Decision

1. Canonical documents advance from schema version 1 to 2. V2 adds required `blueprint: { apiVersion: 1, rules: [] }` at the document root and adds `host-resource` as an explicit component data-source variant.
2. A `host-resource` source is an opaque declarative intent containing a bounded `resourceType`, `resourceId`, and JSON `params`. It contains no URL, HTTP method, headers, token, cookie, or executable function.
3. Blueprint is a restricted data-only rule set. Its only initial trigger is an allowlisted material event; its only actions are setting an ephemeral variable and emitting a named host event. It cannot evaluate JavaScript, resolve arbitrary member paths, or call arbitrary network endpoints.
4. Core compiles Blueprint into a bounded deterministic plan and evaluates events only through an injected runtime port. A plan result is detached JSON state plus named host-event intents. Renderer and Engine never execute Blueprint strings.
5. Renderer resolves a host resource only through an explicitly injected host resource port. It validates the returned value at the JSON boundary, keeps a per-component request generation, and ignores stale/aborted responses after a data source replacement, unmount, or renderer disposal.
6. The V1 to V2 migration has one explicit mechanical step: retain every V1 field, set `schemaVersion: 2`, and add `blueprint: { apiVersion: 1, rules: [] }`. Future input remains rejected; unknown fields remain errors.

## Consequences

- Saved documents describe intent and behavior without persisting credentials or executable code.
- Host adapters retain all authorization, cancellation, retry, cache and observability policy.
- Migration is visible in parser output and snapshots; no silent default is applied to a V2 document missing `blueprint`.
