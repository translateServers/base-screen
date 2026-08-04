# ADR-0009: Remote Plugin Sandbox Cross-Origin Transport

> Status: Accepted
> Date: 2026-08-04
> Scope: cross-origin remote plugin iframe bootstrap, transport verification, lifecycle, and diagnostics
> Supersedes: [ADR-0008](./ADR-0008-remote-plugin-sandbox-protocol.md)
> Implements: [Remote Plugin Sandbox Spec](../specs/remote-plugin-sandbox/spec.md)

## Context

ADR-0008 combined an opaque-origin `sandbox="allow-scripts"` iframe with exact remote-origin validation. Browsers intentionally report opaque-origin sandboxed documents as origin `null`, so that combination cannot prove the advertised message-origin invariant. A production remote transport must keep remote code cross-origin while making the message sender verifiable.

## Decision

1. The remote API accepts `entryUrl`, an HTML bootstrap document URL, rather than a JavaScript module URL. The host does not fetch, import, discover, or register remote code.
2. Before creating an iframe, the host parses `entryUrl` and `expectedOrigin`. Their normalized origins must exactly match and must differ from the embedding document origin. Invalid URLs, an origin mismatch, or same-origin remote execution fail before DOM side effects.
3. The managed iframe uses exactly `sandbox="allow-scripts allow-same-origin"` and `referrerPolicy="no-referrer"`. No forms, popups, downloads, navigation, pointer-lock, storage-access, or other sandbox tokens are granted.
4. `allow-same-origin` is permitted only because the remote origin is required to be different from the host origin; it restores a verifiable `MessageEvent.origin` for the cross-origin sender. Same-origin remote plugins are forbidden.
5. After iframe load, the host posts a strict `init` message only to its managed `contentWindow`, using `expectedOrigin` as `targetOrigin`. Wildcard target origins are forbidden.
6. The host accepts messages only when `event.source === iframe.contentWindow` and `event.origin === expectedOrigin`. A redirect to a different origin cannot receive init and cannot satisfy receive validation.
7. The protocol is strict and limited to `ready` and `emit-event`. `ready` must arrive exactly once before an event. A message is bounded to 64 KiB canonical UTF-8 bytes and must have a valid JSON boundary before detached use.
8. The lifecycle is `loading -> ready | failed -> disposed`. Ready timeout defaults to 5,000 ms and accepts only 100..60,000 ms. Load errors, malformed messages, ordering violations, URL/origin failures, timeout, and disposal return fixed minimal diagnostics without reflecting URLs, payloads, remote error messages, or stacks.
9. `dispose()` is idempotent and removes the iframe, listeners, and timer before resolving any pending ready operation. Remote code receives no Material constructor or catalog, document, command/resource port, credential, or host service object.

## Consequences

- Remote sandbox callers must serve an HTML bootstrap from a distinct, explicitly declared origin.
- The protocol has an auditable browser security boundary and is testable in Chromium.
- Remote Material rendering and all new ports remain out of scope pending a capability-specific ADR.

## Rejected Alternatives

### Opaque-origin iframe with exact remote-origin checks

Rejected because browser `MessageEvent.origin` cannot equal the remote URL origin for the opaque sandbox document.

### Wildcard `targetOrigin`

Rejected because it weakens the binding between the managed frame and the explicitly approved remote origin.

## Verification

Chromium tests cover origin preflight, strict init/ready ordering, source/origin checks, message limits, load error, timeout, disposal, and absence of host capabilities.
