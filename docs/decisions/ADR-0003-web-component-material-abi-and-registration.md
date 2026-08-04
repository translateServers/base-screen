# ADR-0003: Web Component Material ABI And Registration

> Status: Accepted
> Date: 2026-08-03
> Scope: The framework-neutral material ABI, material identity, Custom Element registration ownership, and instance catalog boundary
> Implements: [Plugin Core Contract Spec](../specs/plugin-core-contract/spec.md)

## Context

Base Screen must render first-party and third-party material consistently without coupling its runtime to React, Vue, or a host application. A persistent document requires a stable material identity, while browser Custom Element definitions are process-global and cannot be removed. Treating the browser registry as an instance registry would let one screen alter another screen's available materials.

## Decision

1. A document persists a namespaced, versioned material `type`, never a tag name, constructor, package name, module URL, or framework component.
2. Every material exposes an explicit, versioned Custom Element `tagName` in a strict serializable manifest. `type`, material ABI version, implementation SemVer, tag name, and package SemVer are distinct compatibility axes.
3. The stable runtime ABI is a `BaseScreenMaterialElement` with a complete `model` JavaScript property and a `BaseScreenMaterialConstructor` with a static `manifest` property. Complex state does not cross the ABI through attributes.
4. Renderer writes a full detached model atomically, reuses an existing element for ordinary model changes, and obtains component identity, mode, and interactivity from its own trusted context.
5. Materials issue only `base-screen-material-event` events with a declared event name and JSON-bounded payload. Renderer accepts only bubbling, composed events whose name is in the enabled manifest allowlist; event detail never establishes component identity or permissions.
6. Material authors own explicit browser registration through `define()`. A material package's optional `/auto-register` entry may call that package's documented `define()` functions. `@base-screen/plugin-core`, Plugin Manager, Renderer, Engine, and default package entries never call `customElements.define()`.
7. Repeating `define()` for the same tag name and constructor is idempotent. A tag name bound to a different constructor, or a constructor already bound to a different tag name, fails closed with a stable diagnostic. Registration cannot overwrite or undo browser definitions.
8. Plugin Manager constructs an immutable, per-instance Material Catalog only from explicitly supplied, already-registered candidate material tags and trusted plugin contributions. It only queries a host-provided read-only registry port. It never enumerates, defines, or treats all globally defined tags as enabled.
9. The public ABI directly names standard DOM types (`HTMLElement`, `CustomElementConstructor`, and `CustomEvent`) and packages using it compile with the DOM library. Importing a package remains safe in Node because importing must not access DOM globals.

## Consequences

- Framework bridge packages can produce standards-compliant Custom Element constructors without entering Renderer or Engine's dependency graph.
- Each Viewer or Designer instance can use a different immutable catalog even when the page shares browser-global Custom Element definitions.
- The DOM structure, styling strategy, Shadow DOM policy, themes, and product element tags are intentionally not decided here. They are owned by ADR-0005 and later Renderer/SDK specifications.
- Plugin Core supplies only data contracts, identity validation, and catalog interfaces. Runtime candidate resolution and lifecycle ownership remain with Plugin Manager.

## Rejected Alternatives

### React/Vue renderer contracts

Rejected because every consumer would inherit a framework runtime and framework-specific value model.

### Document-driven module loading

Rejected because a saved document must not choose executable code or a remote module location.

### One mutable global material registry

Rejected because it makes multi-instance enablement, cleanup, testing, and conflict handling nondeterministic.

### Attribute-serialized model updates

Rejected because JSON attributes lose type and identity fidelity, create size and escaping hazards, and make incremental model updates ambiguous.

## Verification

- Plugin Core parsers validate strict manifests, versioned identities, declared events, and detached JSON data.
- Plugin SDK registration tests cover same-constructor idempotence and different-constructor rejection against a real Custom Element registry.
- Plugin Manager tests prove that catalog snapshots are instance-local and no package defines or enumerates browser-global elements during import or candidate resolution.
- Renderer tests prove model property updates preserve the material instance and gate untrusted event data.
