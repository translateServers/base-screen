---
'@base-screen/engine': minor
---

Align the designer icon family with the ported prototype — every glyph is now drawn on the shared
24-unit grid with 1.7 stroke and round caps, and the registry adopts the prototype's names
(`close`/`type`/`rect`/`fit`/`chart-bar`/`distribute-h`/`distribute-v`). The public
`BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS` vocabulary follows, replacing `text`, `chart` and
`container` with `type`, `chart-bar` and `rect`; hosts that pass the old names must rename them.
Ad-hoc 16×16 toolbar, save-status, menu-check and help-close glyphs are replaced by registry icons,
and the theme toggle now swaps the sun/moon pair with the host theme. The prototype leaves the hand,
ellipse and zoom tools as disabled placeholder buttons with no sprite entry, so those three glyphs
are redrawn on the same grid rather than sourced from the prototype.
