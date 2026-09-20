---
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': minor
---

Close the two asymmetries the previous plugin-runtime batch deliberately left open: runtime
contributions were unreachable under lazy activation, and one contribution kind skipped its
declaration check.

### runtime-contribution-lazy-reachability

Under `activation: 'lazy'`, `blueprintAction` and `dataProcessor` contributions were
**declared, authorized and visible in the authoring surface, but unreachable at execution
time**: using one failed closed with `PLUGIN_CORE_CONTRIBUTION_UNKNOWN`, exactly as if the
plugin had never declared it.

The cause was not a missing branch. Eager activation merged all three handler kinds
(command / blueprintAction / dataProcessor) into three maps, while lazy activation merged
only commands — two implementations of one rule, so they could disagree, and they did.

The three maps now live behind one `ContributionHandlerRegistry` that both activation paths
use, and the lazy-activation index (contribution id → declaring plugin) is built from the
same "executable handler" predicate as the executable set. First use of any of the three —
command, blueprint action or data processor — now wakes its plugin in dependency-topological
order. "Will this trigger lazy activation?" and "can it actually run afterwards?" can no
longer give two different answers.

Behaviour change to note: a host running `activation: 'lazy'` that previously relied on these
two contribution kinds being unavailable will now see them execute.

### undeclared-capability-single-source

`PLUGIN_CORE_CAPABILITY_UNDECLARED` is now reported for **every contribution kind that
carries a capability field**, not just commands. An action whose `requiredCapability` was
never listed in the manifest's `capabilities` previously stayed in the manifest and simply
never executed; it is now a preflight failure with a diagnostic.

The rule is read from the `plugin-core` contribution-kind descriptor (`capabilityField`,
exposed through a new narrow `contributionCapabilityField` accessor) instead of being
restated as a kind list in the manager's plan table. The duplicated list was the reason the
`blueprintAction` check went missing: one source said the kind requires a declared
capability, the other — the one that was actually enforced — did not know about it.

Also corrected in this batch, outside the packages: the host-action wiring example in
`docs/usage/events-and-actions.md` and the browser harness both read `action.actionId` from
the blueprint host-action port, which carries `{ name, payload }` — `name` is the document's
`host-action.actionId`. Passing the event through unmapped left `actionId` undefined, so
every blueprint-dispatched action was rejected at the manager while the host saw nothing
wrong.
