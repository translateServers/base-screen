import {
  type DiagnosticCollector,
  type DiagnosticPhase,
  type DiagnosticSegment,
} from '../diagnostics/collector.js';
import type { ScreenDiagnosticCode } from '../types/diagnostics.js';

export type DocumentDiagnosticPath = (path: DiagnosticSegment[]) => DiagnosticSegment[];

export interface ZodIssueLike {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export function addZodIssues(
  issues: readonly ZodIssueLike[],
  baseSegments: DiagnosticSegment[],
  codeForField: (field: string) => ScreenDiagnosticCode,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  for (const issue of issues) {
    if (collector.full) return;
    const path: DiagnosticSegment[] = [];
    for (const segment of issue.path) {
      if (typeof segment === 'string' || typeof segment === 'number') path.push(segment);
    }
    const first = path[0];
    const code = typeof first === 'string' ? codeForField(first) : 'DOCUMENT_FIELD_INVALID';
    collector.add(code, at([...baseSegments, ...path]), phase, issue.message);
  }
}

export function componentFieldCode(field: string): ScreenDiagnosticCode {
  if (field === 'position' || field === 'size' || field === 'rotation' || field === 'zIndex') {
    return 'COMPONENT_GEOMETRY_INVALID';
  }
  if (field === 'type') return 'COMPONENT_TYPE_INVALID';
  return 'DOCUMENT_FIELD_INVALID';
}

export function variableFieldCode(field: string): ScreenDiagnosticCode {
  return field === 'name' ? 'VARIABLE_NAME_INVALID' : 'DOCUMENT_FIELD_INVALID';
}
