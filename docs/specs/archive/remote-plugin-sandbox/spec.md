# Remote Plugin Sandbox Spec

> Status: Active
> Phase: M8
> ADR: [ADR-0009](../../../decisions/ADR-0009-remote-plugin-sandbox-cross-origin-transport.md)

## Requirements

- Remote plugin execution is created only by `createBaseScreenRemotePluginSandbox`; it is not accepted by the trusted `BaseScreenPluginRuntime` lifecycle.
- Host supplies the target element, remote HTML `entryUrl`, exact expected origin, timeout, and optional event callback. The API neither fetches nor imports remote code.
- Before creating an iframe, `entryUrl` and expected origin are parsed and normalized. They must be exactly equal and both must differ from the embedding document origin; invalid or same-origin input fails before DOM side effects.
- Sandbox iframe has exactly `allow-scripts allow-same-origin` and `referrerPolicy="no-referrer"`; it grants no forms, popups, downloads, navigation, pointer-lock, or additional token. The cross-origin precondition makes the restored message origin safe to verify.
- After iframe load, strict init is sent only to the managed `contentWindow` with the exact expected origin as `targetOrigin`; wildcard target origins are forbidden.
- Protocol requires a strict JSON object keyed by `type`; maximum canonical UTF-8 message size is 64 KiB. Only `ready` and `emit-event` are accepted, `ready` occurs exactly once before events, and event names use the canonical ASCII identifier grammar.
- Message source must equal the managed iframe window and origin must equal the supplied expected origin. Any invalid protocol, ordering, origin, source, load error, timeout, or disposal completes `ready()` with fixed diagnostics and no reflected URL, payload, error, or stack.
- Timeout defaults to 5,000 ms and accepts only 100..60,000 ms. `dispose()` is idempotent, removes listeners/frame/timer, and resolves a pending ready wait with the disposal diagnostic. Remote execution receives no Material constructor, catalog, document, command, host-resource, credential, or arbitrary service capability.

## Acceptance

- Default Plugin Manager import does not create an iframe or listener.
- Timeout, malformed message, unexpected source/origin, and disposal have deterministic result codes.
- A trusted runtime remains usable without loading remote sandbox code or sharing state with it.
