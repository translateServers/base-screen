---
'@base-screen/engine': patch
'@base-screen/material': patch
'@base-screen/plugin-core': patch
'@base-screen/sdk': patch
---

Require an explicit material manifest opt-in (`hostResourceSelection`) before exposing the host
asset selection bridge; only `base.image` opts in, so host-resource materials such as metrics and
charts no longer show the "选择素材" button.
