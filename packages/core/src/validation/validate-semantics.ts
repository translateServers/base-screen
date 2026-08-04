import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import { computeComponentBounds } from '../geometry/bounds.js';
import { buildComponentIndex, getAncestorDepth } from '../hierarchy/hierarchy.js';
import { sortDiagnostics } from '../internal/diagnostics.js';

/**
 * Maximum ancestor depth allowed for any component in a Core-valid document.
 * A root has depth 0; a child of a root has depth 1; and so on.
 */
const MAX_ANCESTOR_DEPTH = 256;

/**
 * Validate Core semantic invariants on a canonical ScreenDocument.
 *
 * Contracts is responsible for structural validation (fields, primitives, JSON
 * boundary, resource limits, id uniqueness, parent existence, self-reference,
 * parent cycles, and canonical numeric ranges). Core only verifies the
 * additional domain invariants listed in Spec §10:
 *
 * - No component has an ancestor chain deeper than 256.
 * - Every component's rotated bounds are finite with positive width and height.
 * - Sibling `(zIndex, document order)` ordering is stable (same zIndex legal).
 * - Parent relation does not introduce local coordinate interpretation.
 *
 * The last two are structural guarantees of the canonical document and have no
 * additional runtime check beyond what Contracts and the painter-order
 * algorithm already enforce. The function returns an empty array when the
 * document satisfies all Core invariants.
 *
 * Diagnostics are sorted by path, code, then message, matching Contracts'
 * ordering rules. Consumers must rely only on code and path; message text is
 * not a stable contract.
 */
export function validateScreenDocumentSemantics(
  document: ScreenDocument,
): readonly ScreenDiagnostic[] {
  const index = buildComponentIndex(document);
  const diagnostics: ScreenDiagnostic[] = [];

  for (let position = 0; position < document.components.length; position++) {
    const component = document.components[position]!;
    const depth = getAncestorDepth(index, component.id);
    if (depth > MAX_ANCESTOR_DEPTH) {
      diagnostics.push({
        severity: 'error',
        code: 'CORE_INVARIANT_VIOLATION',
        path: ['components', position, 'parentId'],
        message: `Component ancestor depth ${depth} exceeds the maximum of ${MAX_ANCESTOR_DEPTH}.`,
      });
    }

    const bounds = computeComponentBounds(component);
    if (bounds === null) {
      diagnostics.push({
        severity: 'error',
        code: 'CORE_GEOMETRY_INVALID',
        path: ['components', position],
        message: 'Component rotated bounds must be finite with positive width and height.',
      });
    }
  }

  return sortDiagnostics(diagnostics);
}
