# Host Resource And Blueprint Spec

> Status: Active
> Phase: M5
> ADR: [ADR-0007](../../decisions/ADR-0007-host-resource-and-blueprint-runtime.md)

## Requirements

- The current canonical document requires `blueprint`; missing Blueprint and all unknown root fields are rejected.
- A host-resource source is data-only `{ type, resourceType, resourceId, params }`. It cannot contain network transport, credentials, executable functions, or host objects.
- Blueprint is a bounded data-only rule set. A material-event trigger may set an ephemeral declared variable or emit a named host event. References to missing components or variables fail parsing.
- Core compiles plans deterministically and dispatches only matching events. It returns detached variable state and host-event intents.
- Host resource resolution and host event execution are injected ports. Renderer validates returned JSON, suppresses stale responses, and exposes only fixed public error messages.

## Acceptance

- A document must provide an explicit empty Blueprint when it has no rules.
- A malformed resource response cannot reach a material model as `ready`.
- Material events outside a Manifest event allowlist cannot trigger Blueprint actions.
- Browser harness verifies resource readiness and Blueprint host-event forwarding.
