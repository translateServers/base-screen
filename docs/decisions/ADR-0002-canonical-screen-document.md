# ADR-0002: Canonical Screen Document

> Status: Accepted
> Date: 2026-08-04
> Scope: the single persisted Screen Document contract, JSON boundary, parser, serialization, and JSON Schema
> Implements: [Contracts Foundation Spec](../specs/contracts-foundation/spec.md)

## Decision

1. `@base-screen/contracts` is the sole owner of the persisted document type, parser,
   diagnostics, canonical serializer, and JSON Schema artifact.
2. Base Screen accepts and emits one strict `ScreenDocument` shape. The document has no
   root schema marker and there is no document migration mechanism during the initial
   development stage.
3. The canonical root contains `canvas`, `components`, `variables`, and `blueprint`.
   Every required field must be supplied; the parser does not default, coerce, strip, or
   infer fields.
4. Canonical objects reject unknown fields. Open `props`, `style`, static data, resource
   parameters, and Blueprint payloads must satisfy the shared JSON boundary.
5. Project identity, revision, permissions, publishing state, credentials, transport
   settings, and host data remain outside the document. External exports enter only
   through an explicit importer before parser validation.
6. Parser output is detached plain JSON. Serialization uses deterministic canonical JSON
   semantics and validates the document before producing bytes.

## Consequences

- All packages and hosts work with the same current document shape.
- Inputs carrying legacy or speculative root fields fail closed as unknown fields.
- A future shape change requires a new accepted ADR and active Spec before implementation;
  no compatibility behavior is implied by this foundational contract.
