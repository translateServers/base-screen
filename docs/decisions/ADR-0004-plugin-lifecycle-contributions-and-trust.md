# ADR-0004: Plugin Lifecycle, Contributions, And Trust Boundary

> Status: Accepted
> Date: 2026-08-03
> Scope: Trusted plugin inputs, manifest contributions, capability authorization, lifecycle state, session ports, and catalog publication
> Implements: [Plugin Core Contract Spec](../specs/plugin-core-contract/spec.md), [Plugin Manager Runtime Spec](../specs/plugin-manager-runtime/spec.md)

## Context

Base Screen must accept optional extensions without allowing a document, package name, or remote location to load arbitrary code. Plugins can contribute materials and carefully scoped behavior, but must not receive a mutable Engine store, Core command bus, or arbitrary host service locator. Lifecycle failures must never make a partial material or plugin catalog observable.

## Decision

1. The first plugin model accepts only host-explicit, same-realm, trusted module instances. It makes no claim of sandboxing malicious code. Remote discovery, dynamic imports, iframe/Worker isolation, signed marketplaces, and untrusted execution require a separate threat-model ADR.
2. A Plugin Manifest is strict serializable data. Its identity and dependency declarations are superseded by ADR-0014; all other lifecycle and contribution decisions remain in force. A runtime object is separate from the manifest and exposes `activate`, `deactivate`, and `dispose` hooks.
3. Initial contribution kinds are `material`, `command`, `dataResourceType`, and `blueprintCapability`. Manifests carry declaration data only: no handlers, rendering callbacks, module URLs, credentials, DOM roots, Router, Store, or executable configuration.
4. Plugin Manager resolves all candidates before executing a hook. It parses manifests through Plugin Core, verifies runtime/manifest equivalence, rejects duplicate identities and contribution conflicts, resolves explicit dependencies in deterministic topological order, checks host-approved capabilities, and preflights material constructors through an injected read-only registry query.
5. A plugin only receives the intersection of its declared capability set, the host's explicit approval, and compatible, capability-specific port factories. The activation context contains its instance id, plugin id, granted capabilities, and only those limited ports. It never contains a Core command bus, Engine Store, Router, DOM root, credential, Cookie, Token, or generic `services` object.
6. A Plugin Command Port is asynchronous and accepts a fixed command id plus JSON-bounded arguments. It is session-bound by the host closure. Plugins cannot forge a plugin identity or session, and cannot define new document mutation types.
7. Plugin Manager uses the lifecycle states `inactive`, `activating`, `active`, `deactivating`, `failed`, `disposing`, and `disposed`. Lifecycle operations are serialized. Activation proceeds in resolved order; rollback, deactivation, and disposal use the reverse order of successful activation.
8. Session ports become invalid before deactivation, rollback, or disposal hooks begin. Activation failure rolls back successful plugins and leaves no catalog; a cleanup failure transitions to `failed`, where only disposal is permitted. Disposal is terminal and idempotent after completion.
9. Material and Plugin Catalog snapshots are immutable per-instance values. Both publish in a single commit only after every required plugin is active; they are revoked before cleanup starts. Catalogs expose only `get`, `has`, and sorted `list`, never runtime objects, activation contexts, ports, or mutable registration APIs.

## Consequences

- Plugin Manager is the exclusive owner of candidate resolution, capability approval, activation session lifetime, and catalog publication.
- Plugin Core remains a pure framework-neutral contract package and can be imported in Node without running plugins.
- Engine may implement a limited command adapter, but it does not authorize plugins by itself and does not give plugins direct document mutation access.
- A trusted plugin can still execute arbitrary same-realm JavaScript; the capability system limits supported Base Screen integration points, not JavaScript's ambient authority. Documentation must state this boundary explicitly.

## Rejected Alternatives

### Plugin manifest functions or generic service bags

Rejected because they freeze arbitrary callbacks and host internals into the public ABI, bypassing capability review and deterministic preflight.

### Global plugin singleton registry

Rejected because lifecycle, authorization, and catalogs must remain isolated per Viewer or Designer instance.

### Partial catalog publication during activation

Rejected because a later activation failure would leave Renderer and Engine with an unresolvable mix of materials and plugin contributions.

### Implicit host approval from environment or manifest

Rejected because the host, not a plugin, owns authorization and security policy.

## Verification

- Plugin Core tests validate pure manifests and no default runtime side effects.
- Plugin Manager tests cover dependency ordering, conflicts, authorization intersection, session revocation, rollback, terminal disposal, and two-instance isolation.
- Browser tests use an injected registry query to prove Manager never defines or enumerates Custom Elements.
