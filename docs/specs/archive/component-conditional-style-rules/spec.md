# Component Conditional Style Rules Spec

> 归档：2026-08-30（已完成）
> Status: Archived (historical acceptance record)
> Updated: 2026-08-17
> Authority: ADR-0058
> Related: [ADR-0002](../../../decisions/ADR-0002-canonical-screen-document.md),
> [ADR-0005](../../../decisions/ADR-0005-renderer-dom-shadow-dom-and-product-elements.md),
> [ADR-0016](../../../decisions/ADR-0016-material-appearance-authoring-contract.md),
> [ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)
> Tasks: [tasks.md](./tasks.md)
> Acceptance: [checklist.md](./checklist.md)
> Matrix: [test-matrix.md](./test-matrix.md)

## Goal

Let hosts and designer authors declaratively express data-driven conditional styles (for example,
"turn the metric text red when its value exceeds a threshold") as canonical document data, evaluated
by the Renderer as a pure projection over the component's own `dataState.value`, with automatic
re-evaluation on every data refresh and zero imperative style mutation from hosts.

## Requirements

### R1 Contracts

`ScreenComponentNode` SHALL gain an optional `styleRules` array of strict JSON-safe rules. Each rule
SHALL carry a component-unique `id` (1..64 code points), a `when` condition (`path` of 0..8 segments
of 1..64 code points into the component's `dataState.value`; an `operator` drawn from the same eight
operators as Blueprint conditions; an optional literal `value` that is required for every operator
except `exists` and forbidden for `exists`), and a `style` JSON object. A component SHALL declare at
most 8 rules. The parser and JSON Schema SHALL be strict, detached, and fail closed: unknown keys,
out-of-range counts, duplicate ids, malformed literals, and non-object style values are rejected
without stripping, defaults, or coercion. Documents without `styleRules` SHALL round-trip unchanged.
The schema golden artifact SHALL be regenerated in the same commit.

### R2 Core

`ScreenComponentPatch` SHALL accept `styleRules` with whole-array replacement semantics, mirroring
`style`. Locked targets (directly or via an ancestor) SHALL reject non-status-only patches exactly as
today. Rule edits SHALL flow through the existing transaction/history/dirty/`base-screen-change`
channels with no new command type, and no-op patches SHALL keep the current net-change semantics.

### R3 Renderer projection

Before constructing or applying a material model, the Renderer SHALL evaluate the component's rules
against its current `dataState`: a non-`ready` state matches nothing; `path` resolution walks object
keys, and a decimal non-negative integer segment indexes arrays; an unresolvable path matches nothing
except `exists`, which matches exactly when the path resolves. Ordering operators SHALL apply only to
finite numbers, `contains` only to strings and arrays, and type mismatches SHALL be treated as
non-matches rather than errors. Matched rules SHALL merge into the canonical `style` in document
order, later rules overriding earlier ones per key, producing the effective style. Every rule's
`style` keys SHALL be top-level keys of the material Manifest `styleSchema`, and the merged result
SHALL be validated through the same `styleSchema` path as ADR-0016 decision 6: an invalid rule style
fails closed like an invalid component style, leaving the mounted tree unchanged and reporting through
the existing diagnostic channel. The effective style SHALL live only in the runtime model and SHALL
NOT be written back to the document. Data refresh SHALL re-evaluate rules from retained raw values
without re-issuing host requests, and Viewer and Designer SHALL share this single projection path.

### R4 Designer authoring

The single-selection inspector SHALL gain a "条件样式" section after the style section. The bounded
editor SHALL list existing rules; support adding (up to the 8-rule cap) and removing rules; and edit
each rule's path (segment-joined text), operator (select over the eight operators), literal value
(disabled for `exists`), and style entries through the material's declared `stylePanel` controls,
including the three-mode color palette. Drafts SHALL be validated against the rule shape and the
material `styleSchema`; only valid drafts SHALL be committed, as exactly one transaction carrying the
full replacement `styleRules` array and exactly one history entry. All user-visible strings SHALL come
from centralized UI text, controls SHALL reuse existing style tokens without geometry jitter, and the
section SHALL be absent for multi-selection and read-only for effectively locked components.

### R5 Host integration and harness

Hosts SHALL configure rules through the document itself or the existing public
`executeTransaction`/`executeCommand` surface; no new host API SHALL be added. The browser harness
SHALL demonstrate a threshold-warning text component whose color flips when its data crosses the
configured rule boundary, including the return to the base style when the condition stops matching.

### R6 Quality

Focused tests SHALL cover contract parsing bounds, Core patch semantics, Renderer evaluation and
fail-closed behavior, and Designer authoring commits. `pnpm verify:m0` SHALL pass, and the test
matrix SHALL map every requirement to its evidence.

## Non-goals

- Threshold computation, polling, alerting, notification, or any business warning logic (host-owned).
- Variables, other components' data, expression languages, functions, arbitrary CSS, DOM nodes, or
  host service objects as condition sources or style values.
- Blueprint trigger/action changes; conditional props, geometry, visibility, or animation.
- Multi-selection batch editing of style rules.
- New dependencies or packages.
