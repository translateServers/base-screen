---
'@base-screen/engine': minor
---

Rebuild the designer workbench visual base on the ported design system — light theme is now the
default (`theme="dark"` keeps the dark override and the public `--base-screen-designer-*` surface
is unchanged) — and restructure the workspace chrome: a top-level menubar (file/edit/view/tools)
replaces the "more" menu, the work-mode switch is centered, the status bar groups metrics on the
right, the toolbar gains fit/reset zoom controls, and the command palette opens with Ctrl/Cmd+K.
