# ADR-0015: Runtime Contribution Authority

> Status: Accepted
> Date: 2026-08-04
> Scope: Instance-scoped plugin contribution authority
> Implements: [Plugin Manager Runtime Spec](../specs/plugin-manager-runtime/spec.md), [Runtime And Ecosystem Hardening Spec](../specs/runtime-ecosystem-hardening/spec.md)

## Context

Plugin Catalog entries safely retain contribution summaries and granted capabilities, but Renderer and
Core require a narrow authority to validate host-resource parameters and Blueprint requirements. A
raw Map or Set on the Manager snapshot is mutable at runtime and would expose an implementation
collection rather than a stable contract.

## Decision

1. `@base-screen/plugin-core` owns a readonly runtime contribution authority interface with only
   data-resource lookup and Blueprint capability membership operations.
2. `@base-screen/plugin-manager` derives the authority only from its active Plugin Catalog after all
   plugins activate successfully, then publishes it atomically with Material and Plugin Catalogs.
3. The authority contains detached contribution data and granted Blueprint capability ids only. It
   never contains plugin runtime objects, handlers, resolvers, ports, URLs, credentials, documents,
   or host objects.
4. Renderer and Viewer consume the authority through the Plugin Core interface. They do not import
   Plugin Manager or inspect Plugin Catalog internals.
5. Deactivate and dispose revoke the Manager current snapshot. Previously obtained authorities stay
   inert readonly data and do not acquire lifecycle capabilities.

## Consequences

- Manager snapshot gains one immutable, query-only contribution authority alongside its two Catalogs.
- Runtime validation can fail closed without a global registry or cross-instance cache.
- The boundary remains compatible with independent Manager instances and preserves the Renderer
  package dependency graph.
