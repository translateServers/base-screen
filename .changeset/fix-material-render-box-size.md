---
'@base-screen/material': patch
'@base-screen/plugin-echarts': patch
---

Fix material rendering boxes that did not match their canonical size.

`plugin-echarts` set `width/height: 100%` on its host element in
`renderMaterial()`, overwriting the pixel size the renderer had just written from
`component.size` — a widget declared 480x280 rendered at 960x540, filling the whole
canvas. It now leaves the host box alone, like the official materials.

`base.container` drew its border without `box-sizing: border-box`, so `borderWidth`
added to the declared size (a 1px border made the box 2px larger). It now matches what
the shape materials already do.

Both are covered by a new catalog-wide browser assertion
(`BROWSER_HARNESS_MATERIAL_GEOMETRY_FAILED`) that instantiates every material in the
catalog — including `libraryVisible: false` ones — and requires each render box to
equal its declared size. This replaces per-material assertions, which is why the same
bug was able to reappear in several packages unnoticed.
