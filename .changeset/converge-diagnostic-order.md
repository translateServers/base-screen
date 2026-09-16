---
'@base-screen/contracts': patch
'@base-screen/renderer': patch
'@base-screen/plugin-manager': patch
---

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
