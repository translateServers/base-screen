# Managed toolkit manifest

`vendor-host-skill-kit.mjs` manages exactly these repository-scoped Skill directories:

- `create-base-screen-host-skill`
- `create-base-screen-host-material-skill`
- `manage-base-screen-host-skills`

It also supplies the shared handoff helper at `shared/material-handoff.mjs` and the snapshot module
at `manage-base-screen-host-skills/scripts/snapshot-file.mjs`, because the generators and coordinator
import them without introducing a runtime package.

The toolkit is installed at `.base-screen/tooling/base-screen-host-skills/**` in the host repository
and never under `.agents/skills`, so it does not participate in Codex Skill discovery. Only the two
generated business Skills live under `.agents/skills`.

It writes `.base-screen/host-skill-tooling.json` with:

```json
{
  "generator": "base-screen-host-skill-kit",
  "layout": "tooling",
  "sourceRevision": "<source revision or working-tree>",
  "sourceDigest": "<digest>",
  "managedSkills": [
    "create-base-screen-host-skill",
    "create-base-screen-host-material-skill",
    "manage-base-screen-host-skills"
  ],
  "files": {
    "create-base-screen-host-skill/SKILL.md": "<sha256>",
    "...": "<sha256>"
  }
}
```

The manifest is a tamper and ownership guard, not a package release marker. An update first verifies
that every managed file and path still matches the previous manifest, stages all replacements, and
restores the old directories and manifest if any rename or write fails.

The supplier command is idempotent: one invocation handles first install, managed upgrade, and
legacy-layout migration. Legacy `.agents/skills` copies of the three managed Skills and the old
`.base-screen/host-skill-kit-manifest.json` are migrated automatically only when every managed file
digest matches; manually changed or unmanaged legacy directories are refused with repair hints.
