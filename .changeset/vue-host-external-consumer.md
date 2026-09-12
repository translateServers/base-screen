---
'@base-screen/plugin-sdk': patch
---

Add `examples/vue-host`: a complete modern Vue project that consumes Base Screen as an
external host. It is the first real consumer of the plugin author surface.

The project uses Vue SFCs, `@vitejs/plugin-vue` and `vue-tsc`, and exercises the whole
integration path end to end: a host-owned Vue component bridged into a designer material
via `@base-screen/vue`, a host-owned plugin that declares its own material contribution
plus a `design.read`/`command.execute` command, and element registration through
`createPluginRegistration` — the SDK helper that until now was only exercised by its own
unit tests. The manager snapshot is fed back into the designer verbatim (catalog,
contribution index, panels, inspector controls) instead of rebuilding a parallel copy, so
the plugin channel is genuinely used rather than simulated.

`pnpm verify:tarball` now copies this project outside the repo, swaps every
`@base-screen/*` dependency for the same-batch tarballs, and runs typecheck, build and a
browser loop that asserts the plugin is catalogued, its material renders, the plugin
command round-trips through the document and undoes, and the host project adapter saves.
That makes it an external-consumer check rather than an in-repo example.

Building it also surfaced authoring friction worth recording: the designer must be
connected to the DOM before `configure`/`load` or its canvas stays empty; every ancestor
in the height chain needs a definite height; `update-components` replaces `props`
wholesale, so partial patches drop required fields; and `vue-tsc` cannot yet run on the
repo's TypeScript 7, so the example pins TypeScript 5.9 for its own typecheck. These are
documented in the project README.
