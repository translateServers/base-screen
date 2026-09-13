---
name: manage-base-screen-host-skills
description: Install, refresh, verify, and diagnose repository-scoped Base Screen dashboard and material Skills from a host-owned single-file catalog snapshot. Use for first-time host adoption, routine catalog refresh, generated-Skill drift diagnosis, or CI verification.
---

# Manage host Base Screen Skills

Use this Skill from the Base Screen repository or a host repository root. It coordinates the two
offline generators and keeps their outputs under `.agents/skills`; it does not query a host API
itself and it never changes a material registration file.

## Default workflow

Prefer the shortest safe path:

- First setup or managed upgrade: run the supplier once with `--host <host-root>`. The command is
  idempotent: it detects first install, managed upgrade, or legacy-layout migration, installs the
  toolkit under `.base-screen/tooling`, creates missing config, registers the unified
  `base-screen:skills` package script, validates the export, and refreshes both host Skills.
  Run it from the Base Screen checkout, or from an unpacked host Skill kit (see *Getting the kit*).
- Routine refresh: from the host root, run `pnpm base-screen:skills`. It pulls the latest snapshot
  and atomically refreshes the canonical snapshot and both generated Skills.
- CI: run `pnpm base-screen:skills verify`. It is offline and needs no token.

```text
node <kit>/skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <host-root>
cd <host-root>
pnpm base-screen:skills
pnpm base-screen:skills verify
```

The only required host-specific implementation is the snapshot package script. The host owns it
because it already has the correct authentication, tenant selection, and catalog filtering logic.

## Getting the kit without cloning Base Screen

External hosts do not need the Base Screen repository. Ask the supplier for the packaged host Skill
kit (the supplier runs `pnpm pack:host-skill-kit`, producing `base-screen-host-skill-kit/` and a
matching `.tgz`). Unpack it anywhere and run the supplier command above from there.

**Prerequisite:** the generators validate host snapshots with the public Base Screen packages, so
the **host workspace must have the same-batch `@base-screen/contracts`, `@base-screen/core`,
`@base-screen/plugin-core` and `@base-screen/plugin-sdk` installed**; add `@base-screen/react` or
`@base-screen/vue` only when the host authors React or Vue materials. `plugin-sdk` is required even
for native materials because the generated material Skill tells authors to call
`createMaterialDefinition` from it. If a package is missing, the generator exits with a message
telling you to install it; it never bundles or downloads those packages itself.


## Repository contract

Require `.base-screen/host-skills.json` with exactly:

```json
{
  "packageManager": "pnpm",
  "snapshotScript": "export:base-screen-skill-context",
  "credentialEnvVars": ["XJ_DATAHUB_TOKEN"]
}
```

`credentialEnvVars` is optional and names 1 to 16 safe environment variables the exporter needs;
the toolkit never writes or persists their values. The named package script receives
`BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE` as the absolute path of one temporary file and must write the
single JSON snapshot object described in
[snapshot-contract.md](references/snapshot-contract.md). It owns authentication, tenant/project
selection, online catalog queries, approval filtering, stable ordering, and sanitization. Never put
credentials, connection details, live rows, executable code, or remote module URLs in the snapshot.

## Unified commands

Run the bundled coordinator with Node from the host repository root, or use the registered package
script of the same name:

```text
node .base-screen/tooling/base-screen-host-skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs
node .base-screen/tooling/base-screen-host-skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs verify
node .base-screen/tooling/base-screen-host-skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs check-remote
node .base-screen/tooling/base-screen-host-skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs doctor
```

- No argument: run the exporter to a temporary file, strictly validate and canonicalize it, commit
  the result as `.base-screen/host-snapshot.json`, then atomically refresh both generated Skills. If
  any step fails, the committed snapshot and both Skills stay unchanged.
- `verify`: rebuild both Skills in memory from the committed snapshot and fail on missing, extra, or
  changed generated files and on a snapshot-digest mismatch. It never touches the network and needs
  no credentials; use it as the default CI gate.
- `check-remote`: export to a temporary snapshot and report only whether the online catalog changed.
  It writes nothing and is safe to run on demand.
- `doctor`: report Node, package manager, config, export script, configured credential environment
  variables, toolkit digest state, committed snapshot validity, and generated-Skill state, with
  actionable repair hints.

The legacy `init`, `check`, and `sync` commands are removed; do not document or reference them.

The generated Skill names are `design-<hostId>-screens` and `create-<hostId>-material`. They are
point-in-time approved-catalog snapshots, not live API clients. Run `pnpm base-screen:skills` after a
published host catalog change before asking either child Skill to use the new material.

Design-time draft materials stay outside the snapshot. The host must explicitly pass a validated
`draft-material-catalog.json` to the dashboard validator, and must run its `--published-only` check
before publishing. The handoff validator checks request/candidate/catalog association and supports
the optional `materialProvenance` source index.

## If first setup fails

1. Inspect the host's material registry, resource catalog, dataset descriptors, guidelines, and
   component references.
2. Implement the host-owned exporter as a named package script. Use the current host authentication
   mechanism; do not add a token to this Skill or to `.base-screen`.
3. Run `pnpm base-screen:skills doctor` from the host root. Fix exporter output until the snapshot is
   deterministic, bounded, sanitized, and accepted by both generators.
4. Re-run the supplier command, then commit `.base-screen/host-skills.json`,
   `.base-screen/host-snapshot.json`, `.base-screen/host-skill-tooling.json`,
   `.base-screen/tooling/base-screen-host-skills/**`, the `base-screen:skills` package script entry,
   and both generated child Skills. Do not commit the temporary snapshot file.
5. Add `pnpm base-screen:skills verify` to CI with a read-only service identity. Treat exporter
   failure and catalog drift as actionable failures, while preserving the last committed generated
   Skills.

## Material authoring safety

The generated material Skill reads `registration.policy` from the canonical snapshot's
`materialAuthoring` object. Missing policy means `propose`. In proposal mode it may create source and
tests, but must not edit the configured registration file or plugin manifest; it reports the exact
diff. Only a later explicit user request may apply that proposal after rechecking the target
contents. `apply` is opt-in and still requires preflight, declared verification scripts, and rollback
on failure.

## Toolkit updates

The supplier ships the managed toolkit (two generators, the coordinator, the shared package loader,
the handoff helper, and the snapshot module) as the packaged host Skill kit. Run the supplier once
per update:

```text
node <kit>/skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <host-root>
```

The supplier records source and per-file digests in `.base-screen/host-skill-tooling.json`. It
refuses to overwrite a missing marker, an unmanaged directory, or a manually changed managed file. It
never updates generated child Skills or host business code. Legacy `.agents/skills` copies are
auto-migrated only when their digests fully match the manifest; manually changed legacy directories
are refused with repair hints.

Read [snapshot-contract.md](references/snapshot-contract.md) when implementing or reviewing the
host exporter. Read [tooling-manifest.md](references/tooling-manifest.md) when supplying or auditing
the managed toolkit.
