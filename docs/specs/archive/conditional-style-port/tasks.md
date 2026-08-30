# Conditional Style Port Tasks

> Status: Completed
> Updated: 2026-08-17
> Authority: [ADR-0059](../../../decisions/ADR-0059-conditional-style-port.md)

- [x] P1: Export `BaseScreenConditionalStyleRequest`/`BaseScreenConditionalStylePort` from
      plugin-core (types only, no runtime).
- [x] P2: Renderer `conditionalStylePort` option; per-component resolve at the effective-style
      projection point; merge base → rules → port; `styleSchema` fail-closed with one diagnostic;
      exception isolation; runtime-only effective style.
- [x] P3: Viewer `configure` accepts/validates `conditionalStylePort` (guarded setter + getter,
      zero side effects on failure) and threads it into the Renderer.
- [x] P3: Designer `configure` accepts/validates `conditionalStylePort` and threads it into the
      design Renderer.
- [x] P4: Browser harness demonstrates a host-owned port-driven threshold mapping with automatic
      return, alongside the existing document-rules demo.
- [x] P5: Focused tests for merge order, non-ready dataStates, fail-closed overrides, exception
      isolation, and both configure validations; test matrix updated.
- [x] Register the spec in the active-spec index; update baseline and usage docs.
