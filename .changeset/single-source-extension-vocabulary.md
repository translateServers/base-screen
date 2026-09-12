---
'@base-screen/contracts': minor
'@base-screen/core': patch
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': patch
'@base-screen/engine': patch
---

Give the plugin extension vocabulary a single source of truth. The ten blueprint
capability ids now live in `@base-screen/contracts` (`SCREEN_BLUEPRINT_CAPABILITY_IDS`,
`SCREEN_BLUEPRINT_CAPABILITIES`, and the two single-point constants), and both the
plugin-manager capability table and the engine's blueprint rule normalization read that
list instead of keeping private copies that could drift into silent authorization
failures. `@base-screen/core` re-exports the component-visibility constant from contracts
so its public API is unchanged. Command chrome menus are now declared once in
`@base-screen/plugin-core` (`BASE_SCREEN_PLUGIN_COMMAND_MENUS`, with
`BaseScreenPluginContextMenu` for the context-menu subset) and the manifest validator
derives its allowlist from it. No contribution kinds, capabilities or behavioral
semantics were added or changed.
