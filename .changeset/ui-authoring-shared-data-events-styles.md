---
'@base-screen/engine': patch
---

Add UI authoring for document-level shared data source instances, custom Blueprint event-field
paths, and conditional style rules. The data panel now recognizes `dataValue` consumers, edits
legacy dataset components into shared instances without keeping both forms, and supports reusing an
existing instance; the Blueprint inspector accepts undeclared event fields such as `row.city`; the
appearance panel can add, remove, reorder and edit up to eight color style rules with the same
`styleRules` transaction used by canonical documents.
