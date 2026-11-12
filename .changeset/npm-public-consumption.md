---
'@base-screen/contracts': patch
'@base-screen/core': patch
'@base-screen/renderer': patch
'@base-screen/engine': patch
'@base-screen/material': patch
'@base-screen/plugin-core': patch
'@base-screen/plugin-manager': patch
'@base-screen/plugin-sdk': patch
'@base-screen/host-kit': patch
'@base-screen/sdk': minor
'@base-screen/react': minor
'@base-screen/vue': minor
---

Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.
