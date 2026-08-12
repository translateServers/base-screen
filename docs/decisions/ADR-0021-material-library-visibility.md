# ADR-0021: Material Library Visibility

> Status: Accepted
> Date: 2026-08-07
> Scope: Material Manifest authoring contract and Designer material library filtering
> Implements: [Material Library Visibility Spec](../specs/archive/material-library-visibility/spec.md)

## Context

The official container material (`base.container`) doubles as the group shell: the Designer creates a
container component and reparents the selection into it for the group command, and hosts configure it
via `groupMaterialType`. Users cannot currently drop content into a container directly from the
library (drag-in and create tools always add to the canvas root), so a container card in the library
offers an empty shell with no supported filling workflow, which is confusing and duplicates the group
flow.

Hiding the container from the library must not remove it from the catalog: the group shell, layer
panel reparent targets, and historical documents still need the material registered, rendered, and
editable. The Designer must not special-case material types (the Engine only behaves according to
Manifest-declared capabilities), so the visibility decision must be a declared, validated Manifest
property.

## Decision

1. `BaseScreenMaterialManifest` gains an optional `libraryVisible: boolean` field. Absent means the
   material is visible in the Designer material library (default `true`).
2. Plugin Core validates the field strictly when present: it must be a boolean; non-boolean values
   fail manifest parsing with `PLUGIN_CORE_MANIFEST_FIELD_INVALID`. The field does not become
   required, so existing manifests keep parsing unchanged.
3. The Designer material library (cards, search/filter, click-to-add, drag-to-canvas) offers only
   entries whose `libraryVisible !== false`. The catalog, plugin manager, renderer, viewer, layer
   panel, inspector, and group command are unaffected: hidden-from-library materials remain
   registered, renderable, editable, and usable as group shells.
4. The official container manifest declares `libraryVisible: false`.

## Consequences

- Container cards disappear from the library; containers are created through grouping or loaded from
  documents.
- Third-party materials can use the same flag without Engine type special-casing.
- The canonical document shape is unchanged; the field lives only in the Manifest contract.

## Rejected Alternatives

### Designer-side type filter for the container

Rejected because it special-cases a material type in the Engine, contradicting the manifest-driven
authoring boundary, and offers no reusable path for third-party materials.

### Removing the container from the official material catalog

Rejected because it breaks group shells, layer reparent targets, and rendering of existing documents;
the material must stay registered even when absent from the library.

## Verification

- Plugin Core parser tests cover absent flag (default visible), boolean flag, and non-boolean
  rejection.
- Material tests assert the container manifest declares `libraryVisible: false`.
- Engine DOM tests cover library filtering; the browser harness creates a container through grouping
  and asserts the container card is absent.
