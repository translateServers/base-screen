# Remote Plugin Sandbox Spec

> Status: Active
> Phase: M8
> ADR: [ADR-0008](../../decisions/ADR-0008-remote-plugin-sandbox-protocol.md)

## Requirements

- Remote plugin execution is created only by `createBaseScreenRemotePluginSandbox`; it is not accepted by the trusted `BaseScreenPluginRuntime` lifecycle.
- Host supplies the target element, module URL, exact expected origin, timeout, and optional event callback.
- Sandbox iframe has `allow-scripts` only. Protocol requires JSON object `{ protocolVersion: 1, type }`; maximum message size is 64 KiB.
- Only `ready` and `emit-event` messages are accepted. Event names use the canonical ASCII identifier grammar.
- Message source must equal the managed iframe window and origin must equal the supplied expected origin. Any invalid protocol/origin completes `ready()` with fixed diagnostics and no reflected remote payload.
- `dispose()` removes listeners/frame and resolves a pending ready wait with the disposal diagnostic. Remote execution receives no Material constructor, catalog, document, command, host-resource, credential, or arbitrary service capability.

## Acceptance

- Default Plugin Manager import does not create an iframe or listener.
- Timeout, malformed message, unexpected source/origin, and disposal have deterministic result codes.
- A trusted runtime remains usable without loading remote sandbox code or sharing state with it.
