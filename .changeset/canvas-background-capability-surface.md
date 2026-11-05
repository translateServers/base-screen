---
'@base-screen/contracts': patch
'@base-screen/core': patch
---

Add a single source for canvas background capability.

Canvas background was described in five places (contract schema, Core patch whitelist, designer palette,
agent rules/tool schema, three host compilers). When the contract grew gradients, the last two went silent
instead of failing: the agent answered "画布只支持纯色" for a capability that already shipped.

- `SCREEN_CANVAS_FIELDS` and `SCREEN_CANVAS_BACKGROUND_TYPES` are now public. The field list is referenced
  by `core` instead of being copied, and the type list is derived from the zod background schema so a new
  background form cannot appear in only one of them.
- `isScreenCanvasPaletteColor` / `isScreenCanvasBackground` expose the palette and gradient rules (stops,
  ascending positions, angle/position bounds) so hosts validate with the contract instead of hand-written
  regexes that accepted values the renderer cannot draw (`#12345`).
