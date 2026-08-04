# ADR-0012: Designer Project Lifecycle

> Status: Accepted
> Date: 2026-08-04
> Scope: Project Adapter public contract, Engine project-operation ownership, baseline and conflict semantics
> Historical implementation: [Archived Designer Authoring And Project Lifecycle Spec](../specs/archive/designer-authoring-project-lifecycle/spec.md)
> Current implementation: [Designer Engine Spec](../specs/designer-engine/spec.md)

## Context

The initial Designer Engine exposes load and save through an explicit host adapter, but it has no public cancellation contract, publish capability, operation ownership, conflict lifecycle, canonical dirty baseline, or deterministic retry behavior. Those omissions allow an asynchronous response to replace newer local authoring state and make the persistence API ambiguous.

## Decision

1. `@base-screen/contracts` owns the complete `ScreenProjectAdapter` request/result surface and the stable `PROJECT_*` diagnostics. Requests carry `ScreenAbortSignal`; publish is a capability-gated optional adapter method. Capability and method disagreement is rejected before an adapter is bound.
2. `@base-screen/engine` owns each Designer element's project controller. It owns operation generation, `AbortController`, serialization of mutations, retry timers, project phase, conflict UI state, and the canonical baseline. No Router, Store, credential, endpoint, callback, or module-global session crosses the adapter boundary.
3. A project baseline is `{ projectId, revision, canonicalDocument }`; direct-document mode has a document-only baseline. Dirty is derived by canonical serialization equality and emits only when its boolean value changes.
4. A new load aborts the previous load. Save and publish are serialized and have independent controllers. Replace, unload, disconnect, and dispose abort every pending operation and clear every retry timer. A response is applicable only when its signal is active and its generation, project id, and submitted revision still match.
5. Adapter success values are reparsed through `parseScreenProjectEnvelope()` before application. Revisions are opaque strings and are never trimmed, incremented, parsed, or derived by Engine.
6. Save establishes the submitted response as the new baseline. If the user changed the document while save was pending, the current document remains untouched and is evaluated against that new baseline. Publish never saves implicitly and only succeeds from a clean ready project; it updates project metadata without clearing edits made while it was pending.
7. A conflict preserves local document, history, selection, revision, and baseline. The only recovery actions are a new remote load (with discard confirmation when dirty) or continue editing. Engine does not force overwrite, merge, silently replay a mutation, or implement last-write-wins.
8. Load retries `PROJECT_UNAVAILABLE` at most twice using 250ms then 1000ms delays. Save and publish never retry automatically. Retry scheduling is injected for deterministic tests and is cleared with the operation generation.
9. The Designer configuration owns explicit `groupMaterialType` and `toolMaterialTypes` mappings. Missing, disabled, or capability-incompatible material mappings disable their command/tool; Engine never creates a synthetic material type.

## Consequences

- Public persistence behavior remains host-neutral, cancellable, and safe under response races.
- Each Designer instance contains independent lifecycle, history, baseline, clipboard, and layout state.
- Runtime/Ecosystem work continues to consume this boundary but must not modify it.
- The Designer's document baseline and submitted-snapshot guard become the sole authority for dirty behavior.

## Verification

Contracts tests cover capability consistency, request signals, response parsing, opaque revisions, and minimum-disclosure errors. Engine tests cover abort, generation, retry, conflict, baseline races, mutation serialization, and two-instance isolation. Browser tests cover Pointer Events, Shadow DOM, keyboard behavior, project races, and visual/workflow gates.
