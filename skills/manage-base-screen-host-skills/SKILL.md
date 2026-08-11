---
name: manage-base-screen-host-skills
description: Initialize, check, synchronize, and verify repository-scoped Base Screen Skills from a host-owned online material and dataset snapshot exporter. Use when a host needs to install the two generator Skills, refresh generated dashboard/material Skills, diagnose catalog drift, or prepare a safe CI check.
---

# Manage host Base Screen Skills

Use this Skill from the host repository root. It coordinates the two offline generators and keeps
their outputs under `.agents/skills`; it does not query a host API itself and it never changes a
material registration file.

## Repository contract

Require `.base-screen/host-skills.json` with exactly:

```json
{
  "packageManager": "pnpm",
  "snapshotScript": "export:base-screen-skill-context"
}
```

The named package script receives `BASE_SCREEN_HOST_SKILL_CONTEXT_DIR`. It owns authentication,
tenant/project selection, online catalog queries, approval filtering, stable ordering, and
sanitization. It must write the files described in [snapshot-contract.md](references/snapshot-contract.md).
Never put credentials, transport details, live rows, executable code, or remote module URLs in the
snapshot.

## Commands

Run the bundled script with Node from the host repository root:

```text
node .agents/skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs init
node .agents/skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs check
node .agents/skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs sync
node .agents/skills/manage-base-screen-host-skills/scripts/manage-host-skills.mjs verify
```

- `init` creates the strict config only after the named exporter script already exists in the host
  `package.json`. It does not invent the host exporter or touch business registration.
- `check` runs the exporter and validates both strict input bundles without writing generated Skills.
- `sync` runs a full preflight, then atomically refreshes both generated child Skills. If the online
  service, exporter, validator, or either target fails, leave both existing child Skills unchanged.
- `verify` rebuilds in memory and fails on missing, extra, or changed generated files. Use it in CI;
  it is read-only and does not fall back silently to a stale snapshot.

The generated Skill names are `design-<hostId>-screens` and `create-<hostId>-material`. They are
point-in-time approved-catalog snapshots, not live API clients. Run `sync` after a published host
catalog change before asking either child Skill to use the new material.

## First-time host setup

1. Inspect the host's material registry, resource catalog, dataset descriptors, guidelines, and
   component references.
2. Implement the host-owned exporter as a named package script. Use the current host authentication
   mechanism; do not add a token to this Skill or to `.base-screen`.
3. Run `init`, then `check`. Fix exporter output until all required files are present, deterministic,
   bounded, sanitized, and accepted by both generators.
4. Run `sync` and commit `.base-screen/host-skills.json`, the three managed tooling Skills, and both
   generated child Skills. Do not commit the temporary context bundles.
5. Add `verify` to CI with a read-only service identity. Treat exporter failure and catalog drift as
   actionable failures, while preserving the last committed generated Skills.

## Material authoring safety

The generated material Skill reads `registration.policy` from its workspace reference. Missing policy
means `propose`. In proposal mode it may create source and tests, but must not edit the configured
registration file or plugin manifest; it reports the exact diff. Only a later explicit user request
may apply that proposal after rechecking the target contents. `apply` is opt-in and still requires
preflight, declared verification scripts, and rollback on failure.

## Tooling updates

The Base Screen source repository supplies the three fixed tooling Skills with:

```text
node skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <host-root>
node skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <host-root> --update
```

The supplier records source and per-file digests in `.base-screen/host-skill-tooling.json`. It refuses
to overwrite a missing marker, an unmanaged directory, or a manually changed managed file. It never
updates generated child Skills or host business code.

Read [snapshot-contract.md](references/snapshot-contract.md) when implementing or reviewing the
host exporter. Read [tooling-manifest.md](references/tooling-manifest.md) when supplying or auditing
the three managed tooling Skills.
