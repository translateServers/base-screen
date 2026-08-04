# ADR-0008: Remote Plugin Sandbox Protocol

> Status: Accepted
> Date: 2026-08-04
> Scope: untrusted remote plugin execution, iframe isolation, and message protocol

## Decision

1. Trusted same-realm `BaseScreenPluginRuntime` remains the default Plugin Manager contract. A remote plugin never enters that contract and never receives a Material Catalog constructor or host service object.
2. Remote execution uses a caller-supplied `<iframe sandbox="allow-scripts">` with no same-origin allowance. The host validates `MessageEvent.source`, exact expected origin, protocol version, message size, and JSON data shape before handling a request.
3. The initial protocol is capability-reduced: `ready`, `emit-event`, and `dispose` only. A remote plugin cannot register a Custom Element, execute a command, resolve a host resource, mutate a document, or receive credentials without a later capability-specific ADR and port.
4. Remote resources must be explicitly supplied by the host as a module URL and exact expected origin. The sandbox API creates no network fetch, no implicit registry, and no global install.
5. Timeouts, iframe load errors, malformed messages, unexpected origins, and disposal produce fixed diagnostic codes/messages with no remote payload reflected into diagnostics.

## Consequences

- M8 introduces an isolated transport while preserving the existing Plugin Core/Manager trusted ABI.
- Remote material rendering is deliberately excluded from the initial protocol because Custom Element constructors are same-realm capabilities. Future remote rendering requires a declarative rendering ABI.
