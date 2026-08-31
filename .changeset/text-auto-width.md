---
'@base-screen/material': minor
'@base-screen/engine': minor
---

Add opt-in automatic width for official text, preserving explicit lines and spaces across Designer,
preview, and Viewer. Keep measured widths in runtime geometry without changing saved fallback sizes,
dirty state, or history. Explicit width edits and disabling the option commit fixed widths atomically;
height edits, movement, rotation, cancellation, copying, and inline text editing retain their intended
document and history semantics.
