# ADR-0014: Plugin Manifest Identity-Only Dependencies

> Status: Accepted
> Date: 2026-08-04
> Scope: Plugin Manifest identity and dependency declarations
> Supersedes: The plugin API/core version and dependency range portions of ADR-0004
> Implements: [Plugin Core Contract Spec](../specs/archive/plugin-core-contract/spec.md), [Plugin Manager Runtime Spec](../specs/archive/plugin-manager-runtime/spec.md)

## Context

The exploratory-stage repository rule requires one current plugin Manifest shape and prohibits
version-marker fields, version-discriminated branches, and compatibility designs in public
contracts. ADR-0004 previously required plugin API/core version fields and SemVer dependency
ranges. Those fields would make package distribution details part of the runtime plugin identity
contract before a compatibility policy has been accepted.

## Decision

1. A Plugin Manifest contains a stable plugin `id`, an explicit dependency list of plugin ids,
   requested capabilities, and finite contributions. It contains no version or API-version field.
2. Each dependency declares only its plugin `id`. Plugin Manager rejects a missing dependency and
   dependency cycle, but does not compare ranges or select alternate candidates.
3. Plugin ids remain exact, case-sensitive identities. A candidate collection may contain at most
   one plugin with a given id.
4. Package release metadata remains a distribution concern. It does not influence plugin
   identity, Manifest parsing, catalog lookup, or runtime dependency resolution.

## Consequences

- Plugin Core removes version and range validation from the public Manifest contract.
- Plugin Manager resolves only explicit candidate identities and cycles.
- Contracts no longer needs Plugin Core diagnostics dedicated to unsupported API versions or
  dependency range incompatibility.
- A future compatibility design requires explicit user approval and a successor ADR after the
  exploratory stage.
