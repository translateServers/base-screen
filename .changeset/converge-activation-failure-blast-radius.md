---
'@base-screen/plugin-manager': minor
---

Converge the activation failure blast radius: per-plugin atomic activation replaces the
whole-set rollback. Attributable preflight failures (manifest parsing, capability grants,
registry resolution, cross-plugin contribution conflicts with deterministic first-wins)
and runtime activate() failures exclude only the failing plugin and cascade to its declared
dependents; surviving plugins publish normally. The manager snapshot gains a failures list
for per-plugin observability, while malformed input and unresolvable standalone materials
remain global gates.
