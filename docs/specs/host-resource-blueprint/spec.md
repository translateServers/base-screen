# Host Resource And Blueprint Spec

> Status: Active
> Phase: M5
> ADR: [ADR-0007](../../decisions/ADR-0007-document-v2-host-resource-and-blueprint-runtime.md)

## Requirements

- Current canonical document is V2. V2 requires `blueprint`; V1 migrates only through the explicit `1 -> 2` chain; future versions and V2 missing Blueprint are rejected.
- A host-resource source is data-only `{ type, resourceType, resourceId, params }`. It cannot contain network transport, credentials, executable functions, or host objects.
- Blueprint is a bounded data-only rule set. A material-event trigger may set an ephemeral declared variable or emit a named host event. References to missing components or variables fail parsing.
- Core compiles plans deterministically and dispatches only matching events. It returns detached variable state and host-event intents.
- Host resource resolution and host event execution are injected ports. Renderer validates returned JSON, suppresses stale responses, and exposes only fixed public error messages.

## Acceptance

- V1 parse output is V2 with an empty Blueprint; a V2 document cannot rely on the same default.
- A malformed resource response cannot reach a material model as `ready`.
- Material events outside a Manifest event allowlist cannot trigger Blueprint actions.
- Browser harness verifies resource readiness and Blueprint host-event forwarding.
