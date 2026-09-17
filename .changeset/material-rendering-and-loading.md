---
'@base-screen/engine': minor
'@base-screen/material': minor
'@base-screen/plugin-echarts': patch
'@base-screen/sdk': minor
---

Consolidated record of seven changes to material rendering, typography and the loading surface.

### material-loading-container

Provide an opt-in loading container driven by the public material presentation status. Preserve
content nodes while loading, manage accessibility and cleanup, and expose CSS variables and parts
for host styling without new document fields, requests, registration, or framework dependencies.
Allow status updates to override the plain-text loading label without replacing content nodes.

### shared-material-loading

Expose a framework-independent loading element factory for host-authored materials. The opt-in view inherits typography and color, isolates its styles, supports reduced motion and accessible status text, and leaves data state and lifecycle ownership with the material.

### text-auto-width

Add opt-in automatic width for official text, preserving explicit lines and spaces across Designer,
preview, and Viewer. Keep measured widths in runtime geometry without changing saved fallback sizes,
dirty state, or history. Explicit width edits and disabling the option commit fixed widths atomically;
height edits, movement, rotation, cancellation, copying, and inline text editing retain their intended
document and history semantics.

### image-density-size

Add one-time 1x through 4x natural-image sizing for a singly selected official image while keeping
the resulting component size fixed and the public material and document contracts unchanged.

### rectangle-gradient-border

Allow rectangle border colors to use linear or radial gradients while preserving rounded corners,
transparent or gradient fills, shadows, and canonical component bounds.

### show-shape-border-color

Enable a zero-width border when its color is changed in the Designer, including batch edits, and
keep rendered shape borders inside the canonical component bounds to avoid geometry shifts.

### fix-material-render-box-size

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
