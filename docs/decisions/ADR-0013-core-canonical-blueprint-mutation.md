# ADR-0013: Core Canonical Blueprint Mutation

> Status: Accepted
> Date: 2026-08-04
> Scope: Core command support for already-frozen canonical Blueprint and host-resource data
> Implements: [Host Resource And Blueprint Spec](../specs/archive/host-resource-blueprint/spec.md), [Core Domain Spec](../specs/archive/core-domain/spec.md)

## Context

ADR-0010 and the Contracts Foundation Spec freeze a strict canonical `ScreenBlueprint` and
`host-resource` component data source. Authoring these fields must use the same immutable,
atomic command and history path as all other canonical document fields. Leaving Core's command
union restricted to its earlier document subset would force Engine to mutate the canonical object
directly or create a private compatibility shape.

## Decision

1. `@base-screen/core` adds `replace-blueprint` to `ScreenDocumentCommand`. It accepts only the
   current canonical `ScreenBlueprint`, validates the candidate through the existing Contracts and
   Core postconditions, and has the same no-op and atomic-failure semantics as other commands.
2. `ScreenComponentPatch.dataSource` accepts the existing Contracts-owned
   `ScreenComponentDataSource`, which is `null`, `static`, or `host-resource`. Core neither
   validates host transport nor resolves resources.
3. Core remains responsible only for immutable command application and the separate, pure
   Blueprint compile/evaluate APIs authorized by ADR-0010. Contracts remains the authority for
   the canonical parser, serializer, schema, data shape, and diagnostics.
4. Engine consumes these commands through Core transactions. It does not add a document reducer,
   a compatibility shape, or a runtime fallback.

## Consequences

- Blueprint and host-resource edits participate in one Core transaction and one history entry.
- The public command change is governed by this ADR and the current Core Domain Spec rather than
  treated as an Engine-private extension.
- No Project Adapter, SDK tag, Material ABI, host transport, credential, or runtime execution
  contract changes.
