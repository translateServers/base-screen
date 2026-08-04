# Host Resource And Blueprint Spec

> Status: Active
> Phase: M5
> ADR: [ADR-0010](../../decisions/ADR-0010-host-resource-deadline-and-blueprint-v2.md)

## Requirements

- The current canonical document requires `blueprint`; missing Blueprint and all unknown root fields are rejected.
- A host-resource source is data-only `{ type, resourceType, resourceId, params }`. It cannot contain network transport, credentials, executable functions, or host objects.
- `ScreenBlueprint` is a strict `apiVersion: 1 | 2` discriminated union. V1 retains its current static rule shape and semantics exactly; neither parser nor serializer defaults, upgrades, strips, or infers versions.
- V2 action values and payloads use only bounded literal, event-payload, variable, array, and object data expressions. Paths accept at most 16 canonical identifier segments and reject `__proto__`, `prototype`, and `constructor`; evaluation is detached JSON only and never invokes getters, functions, or a script interpreter.
- V2 conditions use fixed comparison operators. `exists` forbids `right`; all other operators require it. Number comparisons accept finite numbers only without coercion, and `contains` accepts only string/string or array/JSON-value operands.
- V2 rules explicitly declare required stable capabilities. Core compiles only against an injected readonly capability index and rejects the complete plan when any capability is absent.
- Core compiles plans deterministically and dispatches matching rules/actions in document order. A false condition skips its complete rule; an expression or condition error commits neither variables nor host-event intents for that rule.
- Host resource resolution and host event execution are injected ports. Renderer validates returned JSON, suppresses stale responses, and exposes only fixed public error messages.
- Renderer owns a per-resolution deadline through `resourceTimeoutMs`: default 15,000 ms, allowed range 100..60,000 ms. Every resolution has a controller, timer, and generation; timeout aborts then reports `HOST_RESOURCE_TIMEOUT`, while lifecycle replacement/removal/clear/disposal is silent cancellation.
- Host retry, caching, deduplication, transport, authorization, and observability remain host responsibilities.

## Acceptance

- A document must provide an explicit empty Blueprint when it has no rules.
- A malformed resource response cannot reach a material model as `ready`.
- Material events outside a Manifest event allowlist cannot trigger Blueprint actions.
- Browser harness verifies resource readiness and Blueprint host-event forwarding.
