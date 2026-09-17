---
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/engine': patch
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': minor
'@base-screen/plugin-sdk': minor
'@base-screen/renderer': patch
'@base-screen/sdk': patch
---

Consolidated record of five changes that gave shared cross-package semantics a single owner. Each entry keeps the statement the per-change file carried; the extended rationale remains in git history.

### single-source-diagnostic-order

Give the diagnostic order a single source of truth. The canonical comparator lived in
`@base-screen/contracts` but was never exported, so four packages kept their own
line-for-line copies of the same ordering rules: `@base-screen/core`
(`internal/diagnostics.ts`), `@base-screen/plugin-core`, `@base-screen/plugin-manager` and
`@base-screen/plugin-sdk`. `contracts` now exports `compareScreenDiagnostics` and the
uncapped `sortScreenDiagnostics`, and those four copies are deleted in favour of imports.

The four copies were logically identical to the canonical comparator, so this changes no
ordering anywhere. Sorting limits and the `DIAGNOSTIC_LIMIT_REACHED` sentinel stay with
each caller: Contracts' collector is phase-aware and resolves the sentinel path from the
phase, while the plugin-side collectors use an empty path, so those are different
semantics and were deliberately not merged.

This is the first of a series consolidating shared semantics onto their owner. The two
remaining divergent copies — `packages/contracts/src/dataset/diagnostics.ts` and the
renderer's — sort by `path.join('/')` string comparison and therefore order
`['components',10]` before `['components',2]`. They are not touched here and are addressed
separately, because aligning them does change observable ordering.

### single-source-json-semantics-and-hierarchy-seam

Give the shared core↔renderer semantics single owners, and widen the hierarchy seam.

**Structural JSON equality** was implemented four times — `@base-screen/core`'s internal
`equality.ts`, the renderer's `jsonEquals` (whose own comment admitted it mirrored Core), and
`@base-screen/plugin-sdk`'s `areEqual`. `contracts` now owns `screenJsonEquals` and those three
copies are deleted. The three were logically identical, so no comparison result changes.

`@base-screen/plugin-manager`'s preflight equality is deliberately **not** merged into it: that
one answers "is the runtime object equal to its canonical parse", so it reads own *data*
properties only (a getter must not masquerade as a match) and includes non-enumerable keys.
Different question, different implementation, now documented as such.

**Data source validation** no longer requires callers to hand-build a document. Two engine call
sites assembled a whole `ScreenDocument` — canvas, a synthetic component, variables, blueprint —
just to validate one `dataSource` field. `contracts` now exposes `parseScreenDataSource`, which
owns that envelope and returns the canonical data source; diagnostics come back relative to the
data source. The accept/reject decision is unchanged because it still runs the same document
validation path, and both callers discarded the inner diagnostics anyway. The envelope is
relocated rather than eliminated: removing it outright would mean re-deriving the fail-closed
diagnostics that the component-level validator emits, which is a redesign of the most
safety-critical module, not a consolidation.

**The hierarchy seam is wider.** `contracts`/`core` already had `getAncestorIds`,
`getDescendantIds`, `getDescendantSet`, `getAncestorDepth`, `getRootIds` and the `ComponentIndex`
type, but only `buildComponentIndex` and `getPainterOrder` were public, so six consumers rebuilt
parent/child maps by hand. Those queries are now exported. Two engine sites were converted where
the result is provably identical — `selectionSubtree` (same set, document order, and it gains the
query's cycle guard and the document-keyed index cache) and `groupEditingPath` (same root-first
name path, with the dangling-ancestor stop preserved). The remaining sites are left alone: the
renderer's hidden check interleaves session overrides that these queries do not model, and the
inspector's descendant walk is breadth-first while the shared query is depth-first, so converting
it would change observable ordering.

### single-source-contribution-kind-vocabulary

Give the contribution-kind vocabulary a single implementation point. Adding one contribution
kind used to require editing six independent switch/if chains across ten source files (plus
three regenerated API reports) — the last such addition, `blueprintAction` + `dataProcessor`,
touched three files in plugin-core, six in plugin-manager and one in plugin-sdk.

`@base-screen/plugin-core` now owns a `ContributionKindDescriptor` table declaring, once per
kind: its field allowlist, its identity string form, its id lexeme, its kind-specific
validation and its runtime handler field. `validateContribution` (205 lines of switch) reads
that table, and the unknown-kind diagnostic is unchanged. The table itself stays internal;
the package exposes a narrow behaviour interface instead:
`BaseScreenPluginContributionKind`, `BaseScreenPluginContributionHandlerField`,
`contributionHandlerField`, `declaredContributionIds`, `listContributionHandlerKinds`,
`contributionIdentity`, and `readContributionHandlerRecord` (with its input/result types).

`@base-screen/plugin-manager` keeps its own `CONTRIBUTION_KIND_PLAN` for manager-only facts
(index bucket, authorization gate) keyed by the exported kind union, so the table is
**exhaustive** — a new kind that misses its entry is a compile error rather than a silently
missing projection. Its three near-identical `collect*` functions collapse into one
parameterized collector; the duplicated contribution identity is deleted; contribution index
projection no longer branches per kind.

`@base-screen/plugin-sdk`'s handler reader is deleted in favour of the shared one, so
"declarations and handlers correspond one-to-one" exists once instead of twice with different
array handling.

`@base-screen/contracts` adds `isScreenComponentId` and `isScreenVariableName`, replacing
three local regex literals of the same patterns in `contracts`, `core` and `engine` and three
`new RegExp(pattern)` re-wraps in plugin-core.

No contribution kind, capability, diagnostic code, message, path or public signature changed.
The API reports gain only additions.

Known asymmetry preserved: the "declared capability" check still reports
`PLUGIN_CORE_CAPABILITY_UNDECLARED` for `command` only; `blueprintAction` carries the same
`requiredCapability` field but fails closed through the authorization intersection without a
diagnostic. That was true before this change and is left as-is deliberately, and separately:
lazy activation still merges command handlers only, so `blueprintAction` and `dataProcessor`
contributions remain unreachable in `activation: 'lazy'` mode — also pre-existing.

### single-source-extension-vocabulary

Give the plugin extension vocabulary a single source of truth. The ten blueprint
capability ids now live in `@base-screen/contracts` (`SCREEN_BLUEPRINT_CAPABILITY_IDS`,
`SCREEN_BLUEPRINT_CAPABILITIES`, and the two single-point constants), and both the
plugin-manager capability table and the engine's blueprint rule normalization read that
list instead of keeping private copies that could drift into silent authorization
failures. `@base-screen/core` re-exports the component-visibility constant from contracts
so its public API is unchanged. Command chrome menus are now declared once in
`@base-screen/plugin-core` (`BASE_SCREEN_PLUGIN_COMMAND_MENUS`, with
`BaseScreenPluginContextMenu` for the context-menu subset) and the manifest validator
derives its allowlist from it. No contribution kinds, capabilities or behavioral
semantics were added or changed.

### converge-diagnostic-order

Align the last three divergent diagnostic orderings with the canonical one. These are
**observable ordering changes**, called out individually:

1. **`@base-screen/renderer`** — `renderer-diagnostics.ts` sorted by `path.join('/')` string
   comparison, i.e. `['components',10]` came before `['components',2]`. It also had no
   message tiebreak. It now uses the canonical comparator: path segments compare by type
   (numeric segments numerically), then `code`, then `message`.
2. **`@base-screen/contracts`** (internal, not part of the public report) — the dataset
   module carried its own copy of the same joined-string comparison, so dataset parse
   results ordered `['fields',10]` before `['fields',2]` and disagreed with the rest of the
   platform. It now delegates to the canonical comparator.
3. **`@base-screen/plugin-manager`** — the preflight reporting order was a third rule that
   compared path *length* first and ignored segment types. It now uses the canonical
   comparator.

What a consumer actually sees: the `diagnostics` array inside a `ScreenParseResult` may be
ordered differently than before when two diagnostics share a path prefix but differ by a
numeric index of 10 or more, or when they share both path and code and differ only by
message. No diagnostic is added, removed, or changed in `code`, `path`, `message`, or
`severity`, and no signature changed.

`@base-screen/renderer`'s `sortDiagnostics` is internal (it is not part of `renderer.api.md`),
and `@base-screen/contracts`' dataset sorter is not exported, so no public report changes.
No test pinned the old orderings: the renderer, dataset and preflight suites assert codes,
attribution and counts rather than relative order, and all of them pass unchanged.
