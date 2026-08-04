# Base Screen Repository Guide

## Setup And Verification

- Use Node `22.23.2` (`.node-version`) and pnpm `11.18.0` (`packageManager`). Install with `pnpm install --frozen-lockfile`; `.npmrc` deliberately enforces strict peers and disables automatic peer installation.
- CI runs `pnpm verify:m0` on Node 22.23.2 and 24.18.1. It runs `format` (which writes files), then `format:check`, `lint`, `typecheck`, `test`, `build`, `check:packages`, `check:api`, and `verify:tarball`.
- Use focused checks while iterating: `pnpm --filter @base-screen/contracts test`, `pnpm exec vitest run packages/contracts/src/document/document.test.ts`, or `pnpm --filter <package> typecheck`. Run `pnpm verify:m0` before handing off changes that affect packages, build output, or public contracts.
- `pnpm lint` also runs `scripts/check-boundaries.mjs`; `pnpm test` runs package tests through Turbo and then root tests. Turbo `lint` and `typecheck` build dependencies first.
- `pnpm check:api` requires built `dist/index.d.ts`. `pnpm verify:tarball` packs every package and installs each tarball into a temporary consumer; ATTW's Node10/CJS diagnostics for empty ESM packages are expected noise unless the command fails.

## Package Boundaries

- This is a pnpm/Turbo monorepo. `packages/` has a fixed 12-package set enforced by `scripts/check-packages.mjs`: `contracts`, `core`, `renderer`, `engine`, `material`, `plugin-core`, `plugin-manager`, `plugin-sdk`, `react`, `vue`, `sdk`, and `testing`.
- Do not add a package or relax a package manifest/export without updating the package and boundary checks and the governing Spec/ADR. All packages are private, ESM-only, ship only `dist`, and expose public APIs through `exports`.
- Cross-package imports use declared `@base-screen/*` public exports only. `scripts/check-boundaries.mjs` rejects undeclared dependencies, imports from `examples`, `scripts`, or Nebula, forbidden graph edges, and production dependencies on `testing`.
- The dependency allowlist is encoded in `scripts/check-boundaries.mjs`; `contracts` alone may use external `zod`, and React/Vue are peers only of their respective bridge packages. Add a dependency only after updating that allowlist and the package manifest together.
- `contracts`, `core`, `plugin-core`, `plugin-manager`, `plugin-sdk`, and `testing` build with `tsc`; their relative TypeScript imports must use `.js` specifiers (except `.json`). Browser and bridge packages use Vite after declaration emit.
- `@base-screen/testing` consumes public package APIs for fixtures and conformance helpers. Production packages must never import it.

## Contracts And Artifacts

- `@base-screen/contracts` is the sole owner of canonical document types, parsing, diagnostics, serialization, and JSON Schema. Do not duplicate or bypass its parser in another package.
- Its canonical parser is fail-closed: do not add unknown-field stripping, defaulting, coercion, or implicit future-version fallback. Public document-contract changes require an accepted ADR and an active Spec first.
- Exploratory-stage naming rule: do not introduce or retain `V1`/`V2`/`V3`, `v1`/`v2`/`v3`, `/vN`, `-vN`, version marker fields such as `apiVersion`/`schemaVersion`/`implementationVersion`, version-discriminated branches, or version-suffixed public names in documents, material identities, tag names, manifests, fixtures, ADRs, Specs, plans, or public APIs. Use one current shape and one stable name. Any compatibility or versioning design requires explicit user approval after the project leaves this stage.
- `packages/contracts/src/screen-document.schema.json` is a committed golden artifact generated from the built schema with `pnpm --filter @base-screen/contracts build` followed by `node scripts/emit-schema-golden.mjs`. Commit a deliberate golden update with its schema change; the build only copies it into `dist`.

## Documentation And Provenance

- Feature Specs live in `docs/specs/<kebab-case-feature>/`; plans live in `docs/plans/<kebab-case-feature>/`. Keep them versioned and do not leave workflow output in `.trae/`.
- Follow `docs/specs/README.md`: implementations must not silently diverge from an active Spec; public-boundary changes need the relevant ADR/Spec updated first.
- **Persistent Spec Execution.** When a user asks to implement, execute, complete, or remediate an active Spec, treat its `tasks.md` and `checklist.md` as the completion state machine. Do not send a final/completion response while any applicable item remains unchecked. A passing focused check, `pnpm verify:m0`, or completion of one Task is evidence only; it is not completion of the Spec.
- Before ending persistent Spec work, verify that every applicable Task and checklist item is checked with current code and automated evidence, the requirement-to-test mapping is current when the Spec requires one, and all required quality gates pass. Update the Spec artifacts incrementally as evidence is obtained; never mark an item complete without it.
- Continue directly to the next unchecked applicable item after each verified change. Stop only when the Spec completion conditions are met, the user explicitly pauses or redirects the work, or a genuine blocker requires a user decision. In the blocker case, state the exact unchecked items, governing contract/ADR constraint, attempted resolution, and the decision required.
- This project may draw on `C:\worker\nebula`, but copy no Nebula source, app configuration, or assets into this MIT repository without a file-level record in `docs/provenance/` covering source commit/path, authorization, modifications, and attribution decision.

## Code And Tests

- Biome is the sole formatter/linter: 2 spaces, LF, single quotes, semicolons, and 100-column lines. Use `pnpm format` to apply formatting; do not add ESLint or Prettier for style.
- Test custom validation, transforms, discriminated/conditional schemas, security helpers, service branches, and hook state transitions. Do not add tests that only duplicate built-in Zod validation or default unknown-key stripping behavior.
- File-size thresholds are review signals: domain/runtime modules target 300 lines and split above 500; UI controllers target 250 and split above 400; contract/schema files target 400 and split above 600; tests target 500 and split above 800. Generated/data-only artifacts are exempt but must name their generator or authority.
