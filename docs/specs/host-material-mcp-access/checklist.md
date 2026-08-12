# Acceptance checklist

- [x] MCP remains an AI context/validation channel and never loads or executes material packages.
- [x] Old snapshots remain valid; guarded templates and stable catalog digests are deterministic.
- [x] Four resource families and five tools implement strict schemas, stable ordering, and structured diagnostics.
- [x] The stdio reference service uses the official SDK and a replaceable read-only provider.
- [x] Generated Skills prefer MCP, detect digest drift, warn on fallback, and retain local validation.
- [x] Default sync stays atomic, `verify` stays offline, and `check-remote` stays write-free.
- [x] Manuals cover local use, production host boundaries, failure recovery, synchronization, and XJ principles.
- [x] Only two generated business Skills are discoverable.
- [x] Test matrix maps every Requirement to evidence and all required gates pass.
