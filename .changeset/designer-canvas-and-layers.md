---
'@base-screen/engine': minor
'@base-screen/renderer': patch
---

Consolidated record of five changes to Designer canvas editing and the visual layer tree.

### insert-component-public-api

Add `designer.insertComponent(intent)` so a host can add a component by material type: it
builds the node from the manifest defaults, drops it at the visible canvas centre when no
position is given, commits one undoable transaction and selects the new component. Until
now a host had to either hand-build a full `ScreenComponentNode` (re-expanding
defaultSize/defaultProps/defaultStyle/dataSource itself) or drive the private drag MIME
that the docs forbid host code from touching, which left automation, AI-generated screens
and template instantiation without a supported entry point. `update-components` patches
replace `props` wholesale, so partial patches still have to spread the existing props.

This also collapses long-standing duplication: the manifest -> node construction was
inlined in the material-library drop, tool-draw, panel-add and group-create paths, and
`nextComponentId` was copied five times. Both now live in one
`common/operations/material-component` module that the internal paths and the new public
API share, so there is a single place for id generation, default data-source derivation
and canvas clipping to change.

`docs/usage.md` additionally gained the material-manifest field reference (all 15 required
fields plus 6 optional ones), a self-contained minimum custom material example, the
`insertComponent` contract, and two capability boundaries that previously surfaced as
apparent host bugs: the property panel has no component `name` field, and custom-element
registration cannot run under Node/SSR.

### clip-designer-canvas-content

Clip rendered component content to the canonical canvas boundary in Designer, preview, and Viewer surfaces while keeping authoring overlays available for edge editing.

### add-designer-coordinate-entry

Add an X-key, Enter-only coordinate entry popover for atomically editing the canonical position of
one unlocked Designer component, including group translation, validation, focus restoration, and
undo.

### add-layer-selection-shortcuts

Add repeatable Alt-bracket shortcuts for selecting adjacent components in the complete visual layer tree without changing the document or history.

### add-layer-step-shortcuts

Add bracket shortcuts for moving the current sibling layer selection one visual step up or down while preserving existing front/back shortcuts and editable-field behavior.
