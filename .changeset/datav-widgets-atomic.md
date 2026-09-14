---
'@base-screen/plugin-datav-materials': minor
---

Make the large-screen widgets atomic: remove every built-in title.

Each widget now does exactly one thing. `datav.digital-flop` shows a number,
`datav.water-level` shows a level, `datav.scroll-board` scrolls tabular rows,
`datav.border-box` draws a frame. None of them renders a title or description
anymore; the host composes a title by placing a `base.text` next to the widget,
as the feature case now demonstrates.

Built-in titles were the wrong default: they locked the widget's internal layout
(and its padding) to one specific arrangement, could not be wrapped, styled or
aligned independently of the widget, and made the widget unusable in any context
that did not want a heading. Atomic widgets compose in more directions.

Removed props: `title` from all four widgets; `showTitleBar` from `datav.border-box`.
Removed styles: `titleColor`/`titleFontSize` (`fontSize` on the border box) from the
matching widgets. `datav.border-box`'s `fontSize` went with its title bar. Data-bearing
props that are part of the reading itself (`prefix`/`suffix` on the flop, the scroll
board's header row) are kept — those are not descriptions.

A unit test now pins the rule: no widget schema, default props, or property panel may
declare a title-like field, so the constraint is executable rather than a convention.
