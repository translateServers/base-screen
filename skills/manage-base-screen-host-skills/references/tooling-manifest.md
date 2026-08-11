# Managed tooling manifest

`vendor-host-skill-kit.mjs` manages exactly these repository-scoped Skill directories:

- `create-base-screen-host-skill`
- `create-base-screen-host-material-skill`
- `manage-base-screen-host-skills`

It writes `.base-screen/host-skill-tooling.json` with:

```json
{
  "generator": "base-screen-host-skill-kit",
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
that every managed file and path still matches the previous manifest, stages all three replacements,
and restores the old directories and manifest if any rename or write fails.
