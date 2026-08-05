# ADR-0016: Material Appearance Authoring Contract

> Status: Accepted
> Date: 2026-08-05
> Scope: Declarative Material style schema and Designer appearance panel ownership
> Implements: [Plugin Core Contract Spec](../specs/plugin-core-contract/spec.md), [Designer Product Completion](../specs/designer-product-completion/spec.md)

## Context

ADR-0003 freezes a Material model containing `style`, but the original Manifest only declares props
validation and its property panel. Engine therefore cannot determine which style keys are editable,
how to parse them, or whether a proposed style is valid without guessing by Material type.

## Decision

1. Every Material Manifest declares `styleSchema` and `stylePanel` in addition to `defaultStyle`.
2. `styleSchema` uses the existing finite `BaseScreenMaterialObjectSchema`; style does not introduce a
   second validator language, callback, JSON Schema, DOM object, framework component, or host object.
3. `stylePanel` is a strict array of `{ style, label, control }`. It references only a top-level key
   declared in `styleSchema`, once at most, and is separate from `{ prop, label, control }` so their
   ownership is unambiguous.
4. The allowed controls are `text`, `number`, `boolean`, `select`, `color`, and `json`. `color` is an
   authoring control only; values remain ordinary schema-validated JSON strings and are not normalized.
5. `defaultStyle` must satisfy `styleSchema`. Full next style must validate before Engine submits a Core
   command; invalid drafts do not mutate the document, Renderer, or history.
6. Renderer validates component style with the Material entry's `styleSchema` before constructing a
   model. Engine renders fields only from `stylePanel`; it never infers content style from Material type.

## Consequences

- Existing first-party and bridge manifests must explicitly declare their empty or populated style
  schemas and panels.
- Plugin SDK remains a validation/registration helper and does not acquire UI callbacks or Engine
  dependencies.
- The canonical document shape remains unchanged: `component.style` remains a JSON object.

## Rejected Alternatives

### Reusing props descriptors for styles

Rejected because a shared field name would obscure whether a command mutates `props` or `style`, and
would invite type-specific fallback logic in Engine.

### Free-form style JSON

Rejected because it prevents deterministic validation, safe controls, and Material-owned authoring
boundaries.

### CSS property or DOM style objects in the Manifest

Rejected because they are not a portable, strict, serializable public contract and would cross the
framework-neutral ABI boundary.

## Verification

- Plugin Core parser tests cover strict style schema/panel, `color`, defaults, duplicate/missing fields,
  invalid schema values, and detached output.
- Renderer tests reject invalid component style before mounted DOM mutation.
- Engine DOM/browser tests cover valid commits, invalid drafts, labels, accessible controls, and history.
