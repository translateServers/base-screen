---
'@base-screen/engine': patch
'@base-screen/sdk': patch
---

Remove the incomplete canvas thumbnail capture and upload controls and the output-only
`thumbnailUrl` presentation field. Screen thumbnail capture, upload, storage, and listing remain
host-owned; Material Manifest `cover` rendering is unchanged.
