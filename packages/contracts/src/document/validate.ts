import { DiagnosticCollector, type DiagnosticPhase } from '../diagnostics/collector.js';
import { cloneJsonValue } from '../json/clone.js';
import { preflightJsonValue } from '../json/preflight.js';
import type { ScreenDocument } from '../types/document.js';
import {
  MAX_CANONICAL_DOCUMENT_BYTES,
  MAX_COMPONENTS,
  MAX_DATA_SOURCES,
  MAX_VARIABLES,
} from './limits.js';
import { validateReferences } from './references.js';
import { checkStrictObjectKeys } from './strict-object.js';
import { validateBlueprint } from './validate-blueprint.js';
import { validateCanvas } from './validate-canvas.js';
import { validateComponent } from './validate-component.js';
import { validateDataSource } from './validate-data-source.js';
import type { DocumentDiagnosticPath } from './validate-support.js';
import { validateVariable } from './validate-variable.js';

const DOCUMENT_ROOT_FIELDS = new Set([
  'canvas',
  'components',
  'dataSources',
  'variables',
  'blueprint',
]);

export function validateDocument(
  input: unknown,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase = 'root',
  base?: ScreenDocument,
): ScreenDocument | undefined {
  const at: DocumentDiagnosticPath = (path) =>
    phase === 'document' ? ['document', ...path] : path;

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    collector.add('DOCUMENT_NOT_OBJECT', at([]), phase, 'Screen document must be a JSON object.');
    return undefined;
  }

  if (
    !preflightJsonValue(
      input,
      { maxBytes: MAX_CANONICAL_DOCUMENT_BYTES, limitCode: 'DOCUMENT_LIMIT_EXCEEDED' },
      collector,
      phase,
    )
  ) {
    return undefined;
  }

  // base 是同一文档经引用共享派生的候选：与 base 相同的引用已通过校验，
  // 跳过克隆与结构校验；其余（新增/变更）值仍完整克隆与校验。
  const sharedComponents = base === undefined ? undefined : new Set<unknown>(base.components);
  const sharedDataSources =
    base === undefined ? undefined : new Set<unknown>(base.dataSources ?? []);
  const sharedVariables = base === undefined ? undefined : new Set<unknown>(base.variables);
  const candidate = (base === undefined
    ? cloneJsonValue(input)
    : cloneDocumentCandidate(
        input as Record<string, unknown>,
        base,
        sharedComponents!,
        sharedDataSources!,
        sharedVariables!,
      )) as unknown as Record<string, unknown>;
  const diagnosticsBefore = collector.count;
  checkStrictObjectKeys(candidate, DOCUMENT_ROOT_FIELDS, at([]), collector, phase);
  // `dataSources` 是文档级集合，缺省即空集：解析结果始终携带数组，消费者无需再区分「缺失」。
  if (candidate.dataSources === undefined) candidate.dataSources = [];
  if (candidate.canvas !== base?.canvas) validateCanvas(candidate.canvas, at, collector, phase);
  validateComponents(candidate.components, sharedComponents, at, collector, phase);
  validateDataSources(candidate.dataSources, sharedDataSources, at, collector, phase);
  validateVariables(candidate.variables, sharedVariables, at, collector, phase);
  if (candidate.blueprint !== base?.blueprint) {
    validateBlueprint(candidate.blueprint, at, collector, phase);
  }

  if (collector.count > diagnosticsBefore) return undefined;
  const document = candidate as unknown as ScreenDocument;
  return validateReferences(document, at, collector, phase) ? document : undefined;
}

function cloneDocumentCandidate(
  input: Record<string, unknown>,
  base: ScreenDocument,
  sharedComponents: Set<unknown>,
  sharedDataSources: Set<unknown>,
  sharedVariables: Set<unknown>,
): Record<string, unknown> {
  const baseRecord = base as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    const value = input[key];
    if (value === baseRecord[key]) {
      result[key] = value;
    } else if (key === 'components' && Array.isArray(value)) {
      result[key] = value.map((item) => (sharedComponents.has(item) ? item : cloneJsonValue(item)));
    } else if (key === 'dataSources' && Array.isArray(value)) {
      result[key] = value.map((item) =>
        sharedDataSources.has(item) ? item : cloneJsonValue(item),
      );
    } else if (key === 'variables' && Array.isArray(value)) {
      result[key] = value.map((item) => (sharedVariables.has(item) ? item : cloneJsonValue(item)));
    } else {
      result[key] = cloneJsonValue(value);
    }
  }
  return result;
}

function validateComponents(
  components: unknown,
  shared: Set<unknown> | undefined,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!Array.isArray(components)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['components']),
      phase,
      'Expected components to be an array.',
    );
    return;
  }
  if (components.length > MAX_COMPONENTS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['components']),
      phase,
      `Document has more than ${MAX_COMPONENTS} components.`,
    );
    return;
  }
  for (let index = 0; index < components.length && !collector.full; index++) {
    if (!shared?.has(components[index])) {
      validateComponent(components[index], ['components', index], at, collector, phase);
    }
  }
}

function validateDataSources(
  dataSources: unknown,
  shared: Set<unknown> | undefined,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!Array.isArray(dataSources)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['dataSources']),
      phase,
      'Expected dataSources to be an array.',
    );
    return;
  }
  if (dataSources.length > MAX_DATA_SOURCES) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['dataSources']),
      phase,
      `Document has more than ${MAX_DATA_SOURCES} data sources.`,
    );
    return;
  }
  for (let index = 0; index < dataSources.length && !collector.full; index++) {
    if (!shared?.has(dataSources[index])) {
      validateDataSource(dataSources[index], index, at, collector, phase);
    }
  }
}

function validateVariables(
  variables: unknown,
  shared: Set<unknown> | undefined,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!Array.isArray(variables)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['variables']),
      phase,
      'Expected variables to be an array.',
    );
    return;
  }
  if (variables.length > MAX_VARIABLES) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['variables']),
      phase,
      `Document has more than ${MAX_VARIABLES} variables.`,
    );
    return;
  }
  for (let index = 0; index < variables.length && !collector.full; index++) {
    if (!shared?.has(variables[index])) {
      validateVariable(variables[index], index, at, collector, phase);
    }
  }
}
