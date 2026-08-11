# Vue bridge route

Implement the visual component as a typed Vue `Component` and wrap it with
`createVueMaterialDefinition({ manifest, component, mapModel?, eventProps? })`. Map only the detached
Base Screen model into JSON-safe component props. `eventProps` maps component emits to declared
manifest event names; the bridge bounds event payloads and dispatches the standard material event.

The bridge does not accept an adapter option. Normalize tabular data from the detached model inside
the component, or introduce a host-reviewed native wrapper when a catalog adapter is required.
