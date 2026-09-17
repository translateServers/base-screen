---
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/engine': patch
'@base-screen/plugin-sdk': patch
'@base-screen/renderer': patch
'@base-screen/sdk': patch
---

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
