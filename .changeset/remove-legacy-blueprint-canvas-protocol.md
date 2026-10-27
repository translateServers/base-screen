---
'@base-screen/engine': patch
'@base-screen/sdk': patch
---

Remove deprecated Blueprint canvas protocol shims: legacy `condition`/`action`/`trigger` node and
edge kinds, node/edge `ruleId`/`actionIndex`/`condition`/`action`/`summary`/`unconnected` fields,
and the `BaseScreenBlueprintCanvasNodeSummary` type. Delete the unused blueprint summary module and
update the default canvas plus the three example hosts to the relation-only graph contract.
