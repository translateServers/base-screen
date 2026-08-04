# ADR-0006: Designer Engine DOM, Interactions, And History

> Status: Accepted
> Date: 2026-08-04
> Scope: Designer Engine implementation boundary, transient interaction model, Core command/history integration, and unregistered Designer element
> Implements: Designer Engine MVP Spec

## Decision

1. `@base-screen/engine` uses framework-neutral DOM controllers and native Pointer Events. It consumes Renderer for material mounting and never requires React, Vue, Router, host Store, or global state.
2. Engine owns a per-element session containing the current canonical document, Core snapshot history, viewport state, interaction state, dirty baseline, active pointer gesture, and transient overlay state. It creates no module-level current-session registry.
3. Persistent changes flow only through `applyScreenDocumentCommand` or transactions, then enter `commitScreenHistory` exactly once per successful high-level action. Undo and redo restore only document state and reconcile selection.
4. During pointer dragging Engine records a baseline document and applies only a temporary CSS translate to the selected material. It commits one absolute Core position update on pointer completion. Pointer cancel, lost capture, blur, document replacement, unload, and tool changes discard the transient preview.
5. Designer renders controls in its own open Shadow Root: a compact material rail, command toolbar, canvas viewport, selection overlay, and property form. Renderer continues to render only real material elements.
6. Engine exports an unregistered `BaseScreenDesignerElement`. It does not define the stable product tag or import SDK auto-registration. SDK exclusively registers product elements.
7. Host persistence is an explicit asynchronous adapter property. Engine never reads a Token, Cookie, endpoint, Router, or host Store. Adapter revision handling and future resource/DSL operations remain explicit contracts.

## Consequences

- A normal drag produces one document change and one history entry regardless of pointer move frequency.
- Two Designer elements have independent histories, selections, catalogs, and dirty state.
- The initial DOM UI is intentionally operational rather than a public component framework. Its Shadow DOM internals remain replaceable while Custom Element properties and events are SDK contracts.
