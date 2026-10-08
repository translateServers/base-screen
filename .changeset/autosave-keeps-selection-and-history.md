---
'@base-screen/engine': patch
---

Stop a successful `save()` from resetting the designer session. When the adapter returns content that
matches what was submitted, `applySaveResult` now pins the clean baseline to the current document
reference instead of replacing the document through the session, which previously re-rendered every
material, cleared `selectedComponentIds`/`focusedComponentId` and rebuilt the undo history — so an
autosave fired while the author was typing or dragging dropped the selection and the field focus. The
document is still adopted when the adapter normalizes it to different content, and edits made while a
save is in flight still leave the project dirty.
