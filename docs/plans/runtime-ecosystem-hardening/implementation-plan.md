# Runtime And Ecosystem Hardening Implementation Plan

> Status: Active
> Date: 2026-08-04
> Governing spec: [Runtime And Ecosystem Hardening](../../specs/archive/runtime-ecosystem-hardening/spec.md)
> Decisions: [ADR-0009](../../decisions/ADR-0009-remote-plugin-sandbox-cross-origin-transport.md), [ADR-0010](../../decisions/ADR-0010-host-resource-deadline-and-blueprint-runtime.md), [ADR-0011](../../decisions/ADR-0011-nebula-importer-auditable-migration.md)

## Guardrails

- Do not modify `ScreenProjectAdapter`, Engine project session, Designer Shadow DOM, history, persistence, revision, or dirty-state behavior.
- Production packages must not import `@base-screen/testing`.
- Contracts remain the only owner of canonical document parsing, serialization, diagnostics, and schema artifacts.

## Delivery sequence

1. **Contracts Blueprint shape (R3-R4):** define the current Blueprint types, schemas, diagnostics, reference validation, serializer behavior, and regenerate `screen-document.schema.json`.
2. **Core Blueprint evaluator (R3-R4):** compile/evaluate expressions and conditions against readonly capability index.
3. **Contribution projection (R5):** create immutable per-Manager runtime index from active catalog; pass read-only resource/capability validation data to Renderer/Core without runtime handlers or ports.
4. **Renderer deadline (R2):** validate `resourceTimeoutMs`, add request timers/abort classification, preserve generation guard, and add external testing conformance helper.
5. **Remote transport (R1):** migrate sandbox option to `entryUrl`, implement ADR-0009 preflight/state machine and add isolated Chromium harness.
6. **Tarball consumers (R6):** extend `verify-tarballs.mjs` with isolated React and Vue Vite consumers, local type augmentation, build/typecheck, and Chromium lifecycle tests.
7. **Importer (R7):** implement variant analyzer, findings, decisions, collision checks, atomic files, fixtures/provenance, and verifier coverage.
8. **Test and release gate (R1-R7):** maintain requirement-to-test mapping; run targeted package checks first and then browser, importer, tarball, API, boundary, and `verify:m0` gates.

## Requirement-to-test mapping target

| Requirement | Primary package/script | Test category |
| --- | --- | --- |
| R1 Sandbox | `plugin-manager`, runtime browser harness | Chromium protocol/security |
| R2 Host Resource | `renderer`, `testing` | unit + DOM conformance |
| R3/R4 Blueprint | `contracts`, `core` | parser/schema + evaluator |
| R5 Contributions | `plugin-manager`, `renderer`, `core` | integration + isolation |
| R6 Tarballs | `scripts/verify-tarballs.mjs` | packed consumer type/build/browser |
| R7 Importer | `scripts/import-nebula.mjs` | CLI fixture/atomicity |

## Completion gates

Each phase must pass its focused package tests, typecheck, lint, and build before the next integration phase. The final phase additionally runs `pnpm verify:browser`, `pnpm verify:nebula-import`, `pnpm verify:tarball`, `pnpm check:api`, `pnpm check:boundaries`, and `pnpm verify:m0`.
