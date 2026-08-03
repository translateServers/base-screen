# Repository Instructions

## Current State

- Base Screen is pre-implementation: there is no manifest, lockfile, source tree, CI, or executable build, lint, typecheck, or test command. Do not invent commands or report code verification.
- `docs/architecture/base-screen-evolution.md` defines a target architecture, not implemented behavior. Package manager, Node version, toolchain, npm scope, and browser support remain ADR decisions.

## Decision Sources

- Treat unmarked rules in `docs/architecture/base-screen-evolution.md` as confirmed. Its example APIs are semantic sketches; only an accepted Spec and published declarations can freeze signatures.
- For substantive edits to that document, update the date at its top and its change log. Public contracts, dependency direction, security boundaries, or compatibility changes require an ADR; implementation work requires an acceptance-oriented Spec first.
- Once executable config exists, trust it for commands and actual behavior. Do not let implementation silently override an architectural decision: reconcile the document or add an ADR.

## Architecture Boundaries

- Base Screen is an independent, embeddable library. Never import Nebula application code, Router, Store, backend DTOs, authentication, datasets, or UI components.
- Nebula-derived source requires file-level provenance, owner authorization, and an attribution decision before entering the MIT deliverable. Architectural ideas alone do not require a runtime dependency.
- Web Components are the stable host and material ABI. React 19 and Vue 3 are optional material-authoring bridges, not renderer protocols or heavyweight host wrappers.
- `contracts` is the sole owner of persisted wire schemas, public data types, versions, migrations, and cross-boundary diagnostics. Do not duplicate a canonical parser or persisted schema elsewhere.
- Hosts own loading, saving, publishing, resource execution, authentication, and permissions through adapters. Core and DSL compilation stay pure; Base Screen must not read host tokens, cookies, routers, query clients, or stores.
- Project documents may contain stable resource intent, but never executable module locations, URLs, headers, tokens, cookies, SQL, scripts, or connection settings. Host-imported materials and plugins are trusted code; documents never select code to load.
- Cross-boundary document, model, event, and adapter values must remain finite, acyclic JSON without functions, DOM nodes, promises, class instances, dangerous prototype keys, or non-finite numbers.

## Planned Package Ownership

- The confirmed target has twelve packages: `contracts`, `core`, `renderer`, `engine`, `material`, `plugin-core`, `plugin-manager`, `plugin-sdk`, `react`, `vue`, `sdk`, and `testing`. Do not collapse their ownership without an ADR.
- Dependency direction is strict: `contracts` has no workspace dependency; `core` does not depend on plugins, rendering, engine, materials, framework bridges, or SDK; `plugin-core` does not depend on manager or SDK; `renderer` consumes catalog interfaces rather than concrete `plugin-manager`.
- `engine` owns live design sessions, stores, interaction state machines, command dispatch, and history; `core` owns their pure types and algorithms; `renderer` owns runtime DOM and viewer behavior.
- `sdk` is the product assembly layer and sole registrar of `<base-screen-designer>` and `<base-screen-viewer>`. Workspace packages must not import lower-level APIs back through `sdk`.
- `material`, `react`, and `vue` must not depend on engine, renderer, or SDK. React and Vue remain peer dependencies and must not be bundled into published bridges.
- Production packages must never depend on `testing`; that package may depend on public packages only to provide fixtures, fakes, conformance suites, and browser harnesses.

## File Size Guardrails

- Treat line counts as review thresholds, not reasons to split cohesive behavior or create forwarding-only files. Count the whole hand-written file; generated files are exempt.
- Pure domain logic, managers, adapters, and runtime modules should target at most 300 lines; above 500 lines, split by responsibility before adding more behavior.
- Web Components, framework bridges, and UI controllers should target at most 250 lines; above 400 lines, separate rendering, state coordination, and lifecycle code where those concerns are independently testable.
- Contract schemas, declarations, manifests, and migrations should target at most 400 lines; above 600 lines, split by contract or version without duplicating canonical schemas or parsers.
- Tests, fixtures, and harnesses should target at most 500 lines; above 800 lines, split by behavior or scenario unless a data-driven table is clearer as one file.
- Generated and data-only artifacts have no line limit, but must identify their generator or authoritative source and must not contain hidden hand-written behavior.

## Contract Traps

- Keep document, viewport, interaction, and runtime-override state separate. Only document state is persisted and restored by undo/redo.
- Default SDK and material entries must be registration-side-effect free. Registration belongs in explicit `define()` calls or documented `/auto-register` entries; same tag plus same constructor is idempotent, while every identity conflict fails closed.
- Material availability is instance-scoped even though `CustomElementRegistry` is global. Missing, disabled, conflicting, or capability-incompatible materials and plugins must fail closed rather than render placeholders.
- Canonical parsing rejects unknown fields and unknown or future `schemaVersion` values. Old versions use deterministic one-step migration chains; Nebula conversion is a separate importer and must not mutate input.
- React/Vue bridge disconnect cleanup is deferred by one microtask: synchronous reconnect preserves the root and local state; an element still disconnected at the check is fully disposed and later recreated from its last valid detached model.
- Keep package SemVer, document `schemaVersion`, material API version, and material implementation version independent; never infer one from another.
