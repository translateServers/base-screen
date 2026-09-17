---
'@base-screen/engine': minor
'@base-screen/sdk': minor
---

Consolidated record of six changes to the Designer workbench shell, left panel and inspector.

### host-left-panel-groups

Add bounded host-defined Designer left-panel groups with named slots, keyboard-safe navigation,
runtime fallback, and public selection/change APIs.

### refine-error-console

Refine the bounded Designer error console with explicit current/history sections, newest-first
records, stable history clearing, contextual counts, backdrop dismissal, and trapped keyboard focus.

### fix-nested-menu-flyout

Fix the topbar three-level menu so nested flyouts stay usable: hovering into a deeper nested submenu no longer collapses its parent, and a submenu panel that hosts an expanded nested flyout no longer clips that flyout, so it stays visible and clickable.

### descriptor-number-defaults

Create array item numeric defaults within the existing schema bounds, so adding items with required positive or negative numeric fields succeeds without weakening validation or changing saved values.

### designer-host-back-button

Add an optional Designer-owned topbar back button that emits a composed host navigation request.

### remove-canvas-thumbnail-authoring

Remove the incomplete canvas thumbnail capture and upload controls and the output-only
`thumbnailUrl` presentation field. Screen thumbnail capture, upload, storage, and listing remain
host-owned; Material Manifest `cover` rendering is unchanged.
