---
'@base-screen/engine': patch
---

Hide the inspector's data-source tab for materials that declare no data capabilities. The tab is
removed with the `hidden` attribute, but the inspector writes an explicit `display` on its tabs whose
selector outranks the shared `.designer-tab[hidden]` fallback, so the tab kept rendering on
components such as `base.rectangle` and did nothing when clicked.
