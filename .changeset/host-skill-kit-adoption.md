---
'@base-screen/plugin-core': patch
---

Make the host Skill kit adoptable by an external project without cloning Base Screen.

`skills/` lived only in the source repository — no package tarball carried it — so an external host
had to clone Base Screen before it could use agent-assisted authoring. `pnpm pack:host-skill-kit`
now emits a self-contained `base-screen-host-skill-kit/` directory plus a matching `.tgz`: the two
generators, the coordinator, the shared helpers and the six host-skill manuals. Verified end to end
against a fresh host with no Base Screen checkout — the kit installs, both Skills generate, offline
`verify` passes, and the generated material Skill's own validator accepts a real host material while
rejecting a duplicate type.

Two prerequisite defects found by that run and fixed:

- The stated package set was incomplete. Even for a native material the generated Skill tells authors
  to call `createMaterialDefinition`, which lives in `@base-screen/plugin-sdk`, yet only
  `contracts`/`core`/`plugin-core` were listed. `plugin-sdk` is now listed in the kit README,
  `docs/usage.md` §3.4 and the management Skill, with `react`/`vue` noted as conditional.
- The kit README pointed at `docs/host-skill-manuals/` inside the Base Screen repository, which an
  external host cannot read. Those manuals now ship inside the kit and the README references them.

Also extracted the package loader both generators had duplicated into
`skills/shared/host-package-loader.mjs` (registered in the tooling manifest so it is distributed),
and rewrote its failure message to name the required packages and both resolution routes instead of
the previous bare "Cannot load @base-screen/contracts".

Note for release: a packaged `@base-screen/*` tarball must never contain `file:` dependencies
pointing at a supplier machine path. The generators resolve packages from any workspace, so what
matters is that released tarballs carry either workspace-resolvable or registry-resolvable specs.
