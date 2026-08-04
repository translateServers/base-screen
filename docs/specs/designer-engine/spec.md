# Designer Engine Spec

> Status: Active
> Phase: M3
> ADR: [ADR-0006](../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)、[ADR-0012](../../decisions/ADR-0012-designer-project-lifecycle.md)

## Requirements

- `BaseScreenDesignerElement` is an unregistered Shadow DOM element with per-instance document, history, selection, viewport, drag state, catalog, renderer, and optional project adapter.
- Persistent operations pass through Core commands then commit exactly one history entry. Renderer rejection leaves current document/history unchanged.
- Dragging previews through temporary CSS translate only. Pointer completion submits one absolute `update-components` command; cancellation removes preview without history.
- Undo/redo restore Core history and reconcile selection. Material list, property editing, selection, zoom controls, and document change events are Engine-owned authoring UI.
- Project load/save/publish uses only `ScreenProjectAdapter`. Requests carry abort signals; successful results are reparsed canonical Envelopes; Engine stores opaque revisions and exposes no host credential, URL, Router, or Store boundary.
- Project operations are generation-safe and cancellable. A per-instance controller serializes mutations, derives dirty from a canonical baseline, returns stable project diagnostics, preserves local state on conflict, and only retries unavailable loads as specified by ADR-0012.

## Acceptance

- Drag then undo restores the original geometry in one step.
- Two Designer elements do not share selection, history, catalogs, revisions, or transient pointer state.
- Adapter rejection reports diagnostics and retains the prior loaded project/document.
- Default Engine import has no element registration side effect.
