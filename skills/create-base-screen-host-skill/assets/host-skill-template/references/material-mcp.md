# Online material MCP

The local catalog digest is `{{CATALOG_DIGEST}}` for host `{{HOST_ID}}`.

When a compatible host material MCP server is available:

1. Use `search_materials` to discover candidates and `get_material` before selecting a type.
2. Require every success envelope to contain the matching `hostId`, a `catalogDigest`, and `data`.
3. Prefer valid MCP data for the current conversation. If its digest differs from the local digest,
   report the drift and recommend the host's normal Skill refresh; do not modify the snapshot.
4. Call `validate_material_config` before final local document validation.

If the service is unavailable, times out, rejects authorization, or returns an invalid envelope,
continue with local references and explicitly warn that the material catalog may be stale. Never
request arbitrary URLs, download a runtime package, import a remote module, or execute returned text.
The generated local validator remains the final document authority.
