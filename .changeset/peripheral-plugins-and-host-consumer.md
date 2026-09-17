---
'@base-screen/plugin-datav-materials': minor
'@base-screen/plugin-metrics': minor
'@base-screen/plugin-sdk': patch
---

Consolidated record of four changes that established the peripheral plugin zone and the first real consumer of the plugin author surface.

### plugin-datav-materials

Add `@base-screen/plugin-datav-materials`: a peripheral plugin that ships four large-screen
widgets (digital flop, scroll board, water level, decorative border box), its own inspector
control, and a document-transaction command.

It fills a gap left by the two existing peripheral plugins: `plugin-echarts` is the
rendering-class plugin that carries a third-party dependency, `plugin-metrics` is the
declarative plugin with no DOM at all — this one is the rendering-class plugin with **zero**
third-party dependencies, proving that a plugin can deliver real product content (not just a
test probe) using only native DOM/SVG.

The plugin also exercises the plugin-sdk author path end-to-end (`definePlugin` validates its
manifest at construction), contributes an `inspectorControl` that it authorizes for its own
material's `control: 'custom'` field, and ships a command that reads the current selection and
commits an undoable `update-components` transaction.

### datav-widgets-atomic

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

### plugin-metrics-declarative-example

Add `@base-screen/plugin-metrics`: a declarative, DOM-free peripheral plugin that
declares a `dataResourceType` (`metricsSummary`, with a strict `configSchema`) and
the `blueprintCapability` it needs. It complements `plugin-echarts` — that one is the
rendering-class plugin with a third-party dependency; this one is the functional-class
plugin with zero external dependencies and no custom element, so it builds and
validation runs in any environment. The runtime validates its own manifest through
`definePlugin`, making it the first end-to-end example of the plugin-sdk author path.

### vue-host-external-consumer

Add `examples/vue-host`: a complete modern Vue project that consumes Base Screen as an
external host. It is the first real consumer of the plugin author surface.

The project uses Vue SFCs, `@vitejs/plugin-vue` and `vue-tsc`, and exercises the whole
integration path end to end: a host-owned Vue component bridged into a designer material
via `@base-screen/vue`, a host-owned plugin that declares its own material contribution
plus a `design.read`/`command.execute` command, and element registration through
`createPluginRegistration` — the SDK helper that until now was only exercised by its own
unit tests. The manager snapshot is fed back into the designer verbatim (catalog,
contribution index, panels, inspector controls) instead of rebuilding a parallel copy, so
the plugin channel is genuinely used rather than simulated.

`pnpm verify:tarball` now copies this project outside the repo, swaps every
`@base-screen/*` dependency for the same-batch tarballs, and runs typecheck, build and a
browser loop that asserts the plugin is catalogued, its material renders, the plugin
command round-trips through the document and undoes, and the host project adapter saves.
That makes it an external-consumer check rather than an in-repo example.

Building it also surfaced authoring friction worth recording: the designer must be
connected to the DOM before `configure`/`load` or its canvas stays empty; every ancestor
in the height chain needs a definite height; `update-components` replaces `props`
wholesale, so partial patches drop required fields; and `vue-tsc` cannot yet run on the
repo's TypeScript 7, so the example pins TypeScript 5.9 for its own typecheck. These are
documented in the project README.
