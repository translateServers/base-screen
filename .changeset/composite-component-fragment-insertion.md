---
'@base-screen/engine': patch
---

Add `insertComponentFragment` to `<base-screen-designer>`: insert a pre-arranged set of atomic
components as one undoable transaction. Nodes carry anchor-relative offsets, the fragment is
translated as a whole (never per-node clipped), `props`/`style` merge over manifest defaults before
schema validation, and the shell is validated by `designCapabilities.children` rather than library
visibility so `base.container` can act as the group shell. Preset storage stays with the host;
`parseBaseScreenComponentFragmentInsertionIntent` is exported for host-side pre-validation. See
ADR-0087.
