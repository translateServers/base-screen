---
'@base-screen/core': patch
'@base-screen/engine': patch
'@base-screen/sdk': patch
---

Keep thin components clickable on the canvas. `hitTestScreenComponents` accepts an optional
`minimumThickness` that widens the hit band of under-thin axes in the component's local frame, so a
2px `base.rule` divider or a hairline-bordered container still has a target after zooming out. The
gesture controller uses it only as a fallback when the DOM hit lands on nothing: a 10 screen-pixel
band is converted back to canvas units, so the feel is the same at any zoom level, while ordinary
components keep hit-testing strictly inside their own box and blank clicks still start a marquee.
