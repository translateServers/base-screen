---
'@base-screen/plugin-manager': patch
---

Attribute plugin activation failures to the phase that failed, so a failure snapshot locates
its cause.

Every runtime activation failure used to collapse into one message, `Plugin activation
failed.`, whether the host-injected port factory threw while the activation session was being
assembled or the plugin's own `activate` hook threw. A host reading `snapshot.failures` (or the
result of `ensureActive` / a lazily triggered contribution call) could not tell an
environment/wiring fault from a plugin-internal exception without reproducing it.

The two phases are now distinguished by stable messages: `Plugin activation session setup
failed.` (the session assembly failed — only host-supplied port factories and the manager's
own port checks can throw there, and plugin code has not run yet) and `Plugin activation hook
failed.` (the plugin's `activate` threw or rejected). The split is total: session assembly is
the only place host-supplied factories run, and the hook call is the only place plugin code
runs, so every activation failure lands in exactly one bucket.

Both activation paths (eager and lazy) now share one `attemptActivation` implementation
instead of two identical try/catch blocks, so the attribution cannot drift between them.

Failure blast radius is unchanged: a failing plugin is still excluded alone, its session is
invalidated, its declared dependents cascade, and every other plugin's contributions publish
as before. The minimal-disclosure boundary is unchanged too — the caught error's message, name
and stack are still never projected into diagnostics, snapshots or results.
