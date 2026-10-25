---
'@base-screen/engine': minor
'@base-screen/plugin-core': minor
'@base-screen/renderer': minor
---

Add host material catalog hot refresh per ADR-0090: `plugin-core` compares two catalogs by type and
separates manifest-only changes from constructor/tagName/adapter changes; `renderer` validates a
candidate catalog against the current document and swaps it without disposing the runtime, remounting
only changed implementations and preserving data-source state for unchanged types; the Designer gains
`refreshCatalog(catalog)`, which preflights schema, library grouping, children capability and
blueprint event references, then re-renders or rolls back atomically.
