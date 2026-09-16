---
'@base-screen/contracts': minor
'@base-screen/core': patch
'@base-screen/engine': patch
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': minor
'@base-screen/plugin-sdk': minor
'@base-screen/sdk': patch
---

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
