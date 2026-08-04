# ADR-0005: Renderer DOM, Shadow DOM, And Product Elements

> Status: Accepted
> Date: 2026-08-04
> Scope: Renderer DOM ownership, material mounting and diffing, event trust boundary, Viewer element construction, and SDK registration ownership
> Implements: Renderer/Viewer Spec

## Decision

1. Renderer owns only a supplied render root. It renders canonical components as absolute-positioned material Custom Elements and never owns selection handles, drag controls, property panels, or history.
2. Renderer resolves every component type through an explicit immutable `BaseScreenMaterialCatalog`. Missing material, invalid props, unsupported data capability, or malformed model input fails before mutating the current render tree.
3. Renderer diffs by component id. The same id with the same resolved material constructor keeps its element instance through ordinary props, style, size, data-state, mode, and interactive updates. A type/constructor change replaces only that element; removed ids detach listeners and DOM nodes.
4. Every material receives a detached complete `model` through its JavaScript property. Renderer forwards only static document data in the initial runtime. Host-resource execution, DSL dispatch, and runtime overrides enter through later controlled contracts.
5. Renderer installs a listener per mounted material and derives component id, type, manifest, and interactivity from its own mount record. It accepts only bubbling, composed `base-screen-material-event` events whose strict detail and name pass Plugin Core validation and the enabled Manifest event allowlist.
6. Renderer exports an unregistered `BaseScreenViewerElement`. Its internal render root is an open Shadow Root so product layout styles do not leak into a host page. Material elements remain light-DOM children of that Shadow Root and retain their own implementation choices.
7. Renderer never defines the stable `base-screen-viewer` or `base-screen-designer` tags. `@base-screen/sdk` exclusively owns their explicit and auto-registration functions. Renderer default import does not access `customElements`.

## Consequences

- Renderer can run multiple isolated Viewer roots against different catalogs on the same page.
- A Viewer property change reports diagnostics through a Custom Event but keeps its prior rendered document on failed replacement.
- Shadow DOM is a style boundary, not a code-security boundary. Materials remain trusted same-realm code under ADR-0004.
- Designer Engine composes Renderer rather than duplicating material DOM logic.
