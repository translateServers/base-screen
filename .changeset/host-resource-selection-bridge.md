---
'@base-screen/engine': minor
'@base-screen/sdk': minor
---

Replace the canvas-specific background image host protocol with the unified host resource selection
bridge per ADR-0089. `requestHostResourceSelection` dispatches a single request event for either the
canvas background or a legacy image component; `commitHostResourceSelection` validates the pending
session and writes one Core transaction (no URL, token, or header is stored). The old
`requestCanvasBackgroundImage` / `commitCanvasBackgroundImage` methods, their event and request types,
and the `canvasBackgroundImageButton` flag are removed in favor of `hostResourceSelectionButton`.
The SDK designer entry re-exports the selection event and its contract types for host apps.
