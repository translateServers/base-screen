# Renderer And Viewer Spec

> Status: Archived (historical acceptance record)
> Phase: M2
> ADR: [ADR-0005](../../../decisions/ADR-0005-renderer-dom-shadow-dom-and-product-elements.md)

## Requirements

- Renderer accepts only a supplied root, immutable Material Catalog, mode, interactivity, optional resource port, and material-event callback.
- A render pass parses the canonical document, resolves every material, validates props through Plugin Core, prepares all models, and returns diagnostics without changing mounted DOM on preparation failure.
- Mount identity is `component.id`. Same id/type retains the element instance; a type change replaces it; a removed id removes its listener and element.
- Renderer applies document geometry to the material element and computes hidden inheritance through Core. Renderer does not render authoring chrome.
- Material model is complete and detached. Static data becomes `ready`; host-resource becomes `loading`, then a generation-guarded `ready` or fixed error state.
- Renderer forwards only bubbling, composed standard events with valid detail and a Manifest-allowlisted name. Callback identity comes from the private mount record, never DOM attributes supplied by a material.
- A throwing material constructor, material model assignment, or host material-event callback is isolated per component: the failed component is skipped on first mount and keeps its previous mounted element on update; every other component still renders. Isolated failures are reported as `PLUGIN_CORE_RENDER_FAILED` diagnostics through the render result and the optional diagnostic callback, and never rethrow.
- `BaseScreenViewerElement` is unregistered, uses open Shadow DOM, and exposes `catalog`, `document`, `resourcePort`, and `blueprintRuntimePort` properties.

## Acceptance

- Missing material and invalid props leave the preceding render tree unchanged.
- Repeated render of a changed props/style model preserves element identity for the same component id/type.
- A stale resource response cannot change a replaced, removed, or disposed component.
- Viewer default import does not access `customElements`; SDK owns Viewer tag registration.
- A material that throws during construction, model application, or host event callback never aborts the render pass; other components render and the failure is reported with `PLUGIN_CORE_RENDER_FAILED`.
