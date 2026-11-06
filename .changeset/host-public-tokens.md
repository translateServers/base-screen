---
'@base-screen/engine': minor
'@base-screen/sdk': minor
---

Add a public host token layer (`--bs-host-*`) for host-owned panels.

Hosts that render their own content into a named designer slot (for example the left-panel
`leftPanelGroups` slots) had no consumable design tokens: `designer-tokens.css` is injected into the
engine shadow root via `?inline`, and no package exported any CSS. Every host therefore copied the
palette by hand — the three example hosts shipped an identical dark-only copy, so their panel stayed
dark after the workbench switched to `theme="light"`.

- `@base-screen/engine/host-tokens.css` and `@base-screen/sdk/host-tokens.css` publish a baked token
  layer with the public prefix `--bs-host-`: 33 theme pairs (surfaces, text, borders, accent, focus
  ring, elevation, semantic colours, primary action, scrollbar, modal scrim) plus 47 shared geometry
  and typography tokens (space, radius, control height, icon size, row height, card geometry, font, tracking,
  motion). Card geometry (`--bs-host-card-min-width` / `-gap` / `-thumb-aspect`) is shared with the material
  library, so a host asset card and a built-in material card have the same width and thumbnail ratio.
- The file is generated from `designer-tokens.css` by `tooling/build/host-tokens.mjs`; token values are
  never hand-written. Generation unwraps the `--base-screen-designer-*` override hooks to their baked
  fallbacks and remaps internal `var(--designer-*)` references, so no engine-internal name leaks into
  the public layer.
- Tokens are scoped with zero-specificity `:where(.bs-host)` and
  `:where(.bs-host[theme="light"], base-screen-designer[theme="light"] .bs-host)`, so hosts can override
  a single token from any class selector. The layer only declares custom properties plus `color-scheme`.
- `pnpm check:host-tokens` guards the layer: regeneration must be byte-identical, every source token
  must exist, no internal name may leak, theme tokens must be declared in both blocks, and the public
  name set must match a compatibility snapshot (removing or renaming a token requires editing it).

Name stability is the contract; values are visual tuning. The public layer does not add new spacing or
type steps and does not raise the 30/28px control geometry to a 44px target — doing so would make host
panels looser than the adjacent built-in panels.
