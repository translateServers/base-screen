---
'@base-screen/engine': patch
---

Clicking a locked component on the canvas now clears the selection instead of preserving it. The
renderer does not apply `pointer-events` to locked materials, so a locked full-canvas backdrop —
the common big-screen "don't let me nudge the background" pattern — was the hit target for every
blank point, which made click-to-deselect unreachable. Dragging out of a locked component still
starts a marquee, and locked components remain non-selection-targets in the committed selection.
