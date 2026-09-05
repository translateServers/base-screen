---
name: base-screen-integration-workflow
description: Coordinate Base Screen and its XJDataHub host integration in one task. Use for shared feature ownership, public API consumption, package or context synchronization and joint verification; unrelated business work does not require this workflow.
---

# Base Screen integration workflow

Run pnpm integration status first. It distinguishes the current upstream checkout from the
packages actually installed by the host. Source-free host checks use the committed snapshot.
Use pnpm integration context with only the relevant capability IDs, then read those references.
Do not load both repositories' entire documentation or interpret a pending proposal as an API.

For implementation, begin a named task before editing managed outputs:

~~~text
pnpm integration begin <id> --capability <id,id> --goal "<outcome>"
pnpm integration begin <id> --route both --decision "<ownership and contract>" --next "<next action>"
pnpm integration sync --task <id>
pnpm integration verify --task <id> --profile delivery
pnpm integration begin <id> --upstream complete --downstream complete
pnpm integration finish --task <id>
~~~

Routes are host, upstream, both, needs-info. Resolve semantic ownership from public capabilities,
code and the user's intent; scripts calculate facts, not architecture decisions.
The same task may implement related changes in both repositories. Default to one agent and
one task; delegation and creation of other tasks are not prerequisites.

Sync defaults to local delivery checks and only rebuilds changed package inputs.
During iteration, focused verification and sync --profile focused can be used; finish still
requires delivery evidence. Never bypass a managed-file conflict or relabel a failed check.
Tasks, receipts and logs live under the ignored .base-screen/local/integration directory of
the initiating repository. Resume them from either repository with --task.

For setup, recovery, cache rules, command options and document ownership, read
[the workflow reference](references/workflow.md) only when needed.
Commit, push, deployment, online catalog refresh and production migration require the
applicable authorization; this Skill does not grant it.
