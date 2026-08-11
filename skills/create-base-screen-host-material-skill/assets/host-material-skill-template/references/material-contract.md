# Public Base Screen material contract

Use the public `@base-screen/*` exports only. The stable runtime ABI is a Custom Element constructor
with a static `manifest` and a complete `model` property. A document stores the manifest `type`; the
host supplies the enabled catalog and registration.

## Manifest minimum

The manifest must include `type`, `tagName`, `name`, `category`, `keywords`, `defaultSize`,
`defaultProps`, `defaultStyle`, `propsSchema`, `propertyPanel`, `styleSchema`, `stylePanel`, `events`,
`dataCapabilities`, and `designCapabilities`. Optional `defaultData`, `dataBinding`, `libraryVisible`,
and `editorDescriptor` must pass Plugin Core parsing. Unknown fields fail closed.

Validate with `parseBaseScreenMaterialManifest`, then validate instance props/style with
`validateBaseScreenMaterialProps` and `validateBaseScreenMaterialStyle`. Defaults must satisfy their
declared object schemas. Binding roles use `id`, `minFields`, `maxFields`, and `valueTypes`.

## Data and events

Use `dataCapabilities: ["static"]` for self-contained data, or include `"host-resource"` and declare
roles for host dataset bindings. A tabular adapter is a static `tabularDataAdapter` on the native
constructor and returns a JSON-safe parse result. React/Vue bridges receive a normalized model; keep
field adaptation in the component or use a native wrapper when an adapter is required.

Events must be listed in `events`; dispatch only a JSON-bounded `CustomEvent` named
`base-screen-material-event` with `{ name, payload }` detail. If an editor descriptor declares event
metadata, every name must also appear in the manifest event list.

## Authoring boundary

Use `createMaterialDefinition` for native elements, `createReactMaterialDefinition` for React
components, and `createVueMaterialDefinition` for Vue components. Use
`createBaseScreenMaterialEditorDescriptor` for a JSON-safe descriptor builder when it is useful.
Never add a framework component, render function, DOM node, promise, source string, credential, or
service object to a manifest or descriptor.
