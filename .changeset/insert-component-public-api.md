---
'@base-screen/engine': minor
---

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
