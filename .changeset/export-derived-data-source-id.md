---
'@base-screen/contracts': patch
---

Export `derivedDataSourceId` so consumers stop re-implementing the derived instance id.

Legacy documents (component `dataSource` / variable data sources) get a read-only instance view whose
id is derived from its owner. That id is the join key between a `dataValue` reference and the instance
list: if an engine builds the same string itself, the two can drift, and the drift is invisible to the
type system — it surfaces as "referenced instance does not exist" or as a changed request key.

The function is now the single authority for the rule; engines must call it instead of concatenating.
The doc comment also records why the id depends on the owner only (rotating the dataset must create a
new instance rather than mutating `source`, otherwise every referrer silently switches datasets).
