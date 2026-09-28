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

### full-stack-host-examples-and-vue-external-consumer

Restructure `examples/` around a full-stack host case: one shared backend plus three
feature-equivalent front ends, so the "how a host actually embeds Base Screen" path is
executable rather than described.

`examples/host-api` (NestJS + Prisma/SQLite) owns storage, retrieval and concurrency
control: canonical Screen Documents are stored as opaque JSON behind a documented REST
contract, `PUT` enforces a host-side `revision` optimistic lock, and a deterministic mock
metrics endpoint feeds the bundled `host-resource` data binding. `examples/host-app-vanilla`,
`examples/host-app-react` and `examples/host-app-vue` are pure static SPAs that consume only
public `@base-screen/*` entries and implement the same three pages (list, designer edit with
debounced autosave, read-only viewer), the same host project adapter, the same host data
channel, and one host-owned `host-app.kpi-card` material each — written with a native custom
element, a React bridge and a Vue SFC respectively, all under the same manifest, so one
canonical document renders identically in all three.

All three front ends run the same state machines through **zustand**: a list store
(`idle → loading → ready` / `loading → error`, with `load` / `create` / `remove`) and a
per-screen session store (`idle → loading → ready → dirty → saving → saved`, with
`saving → failed` and `saving → conflict` branches) shared by the editor and viewer pages.
The store semantics and the user-facing status text are identical across the three stacks;
only the binding differs — `zustand`'s `create` plus selector subscriptions in React, the
framework-agnostic `zustand/vanilla` store consumed through a `shallowRef`-based composable
in Vue and through `subscribe` in the vanilla app.

The infrastructure carriers moved out of `examples/` to make that structure honest:
`examples/browser-harness` became `harness/browser-harness` (it is the repo's own
feature matrix and Playwright evidence, not a usage example) and
`examples/material-mcp-server` became `tooling/material-mcp-server`. Their gates are
unchanged apart from the paths. The minimal-Vanilla/Viewer consumer used by
`pnpm verify:tarball` is now generated inline instead of copied from an example directory,
so the gate no longer depends on the shape of `examples/`.

`pnpm verify:tarball` copies `examples/host-app-vue` outside the repo, swaps every
`@base-screen/*` dependency for the same-batch tarballs, and runs typecheck, build and a
browser loop asserting registration, material rendering, host-resource data binding, the
host project adapter's revision increment on save, and the viewer. The backend is stubbed
through Playwright `page.route` for that gate — it exists to prove the published ABI and the
host integration path, while backend behavior is covered by the jest unit and e2e suites
shipped in `examples/host-api`. That makes it an external-consumer check rather than an
in-repo example.

Building these surfaced authoring friction worth recording: the designer must be connected
to the DOM before `configure`/`load` or its canvas stays empty; every ancestor in the height
chain needs a definite height; `update-components` replaces `props` wholesale, so partial
patches drop required fields; a material's render box is pinned to the canonical
`component.size`, so materials must not write `width`/`height`; the React bridge does not
propagate document styles into the designer shadow root (the Vue bridge does), so React
materials must be self-styled; and `vue-tsc` cannot yet run on the repo's TypeScript 7, so
the Vue example pins TypeScript 5.9 for its own typecheck. These are documented in the
example READMEs.
