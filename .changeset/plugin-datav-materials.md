---
'@base-screen/plugin-datav-materials': minor
---

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
