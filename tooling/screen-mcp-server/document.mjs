/**
 * Read path mirrors the host contract: the one-way migration always runs and is idempotent,
 * so a current document passes through unchanged while legacy shapes are rewritten in memory.
 * A document that cannot be migrated is rejected fail-closed with the parser diagnostics.
 */
export function normalizeScreenDocument(apis, input) {
  const migration = apis.migrateScreenDocument(input);
  if (migration.ok)
    return {
      ok: true,
      document: migration.document,
      migrated: migration.decisions.length > 0,
      decisions: migration.decisions,
      diagnostics: migration.diagnostics,
    };
  const parsed = apis.parseScreenDocument(input);
  return {
    ok: false,
    migrated: false,
    decisions: migration.decisions,
    diagnostics: apis.sortScreenDiagnostics([...parsed.diagnostics, ...migration.diagnostics]),
  };
}

export function collectDocumentDiagnostics(apis, document) {
  return apis.sortScreenDiagnostics([
    ...apis.validateScreenDocumentSemantics(document),
    ...apis.diagnoseDataSourceCycles(document),
  ]);
}

export function formatDiagnostic(diagnostic) {
  return `${diagnostic.code}@${diagnostic.path.join('/')}`;
}
