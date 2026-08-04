import {
  DiagnosticCollector,
  type DiagnosticPhase,
  type DiagnosticSegment,
} from '../diagnostics/collector.js';
import { canonicalByteLength, codePointLength, hasControlCharacter } from '../json/canonical.js';
import { cloneJsonValue } from '../json/clone.js';
import { preflightJsonValue } from '../json/preflight.js';
import type { ScreenDiagnosticCode } from '../types/diagnostics.js';
import type { ScreenDocument } from '../types/document.js';
import type { ScreenJsonValue } from '../types/json.js';
import {
  MAX_BACKGROUND_COLOR_CODE_POINTS,
  MAX_BLUEPRINT_ACTIONS_PER_RULE,
  MAX_BLUEPRINT_RULES,
  MAX_CANONICAL_DOCUMENT_BYTES,
  MAX_COMPONENTS,
  MAX_DATA_SOURCE_VALUE_BYTES,
  MAX_NAME_CODE_POINTS,
  MAX_VARIABLES,
} from './limits.js';
import { validateReferences } from './references.js';
import { blueprintSchema, canvasSchema, componentSchema, staticVariableSchema } from './schema.js';

const DOCUMENT_ROOT_FIELDS = new Set(['canvas', 'components', 'variables', 'blueprint']);
const CANVAS_FIELDS = new Set(['width', 'height', 'backgroundColor']);
const COMPONENT_FIELDS = new Set([
  'id',
  'type',
  'name',
  'parentId',
  'position',
  'size',
  'rotation',
  'zIndex',
  'status',
  'props',
  'style',
  'dataSource',
]);
const POSITION_FIELDS = new Set(['x', 'y']);
const SIZE_FIELDS = new Set(['width', 'height']);
const STATUS_FIELDS = new Set(['locked', 'hidden']);
const STATIC_DATA_SOURCE_FIELDS = new Set(['type', 'value']);
const HOST_RESOURCE_DATA_SOURCE_FIELDS = new Set(['type', 'resourceType', 'resourceId', 'params']);
const VARIABLE_FIELDS = new Set(['type', 'name', 'value']);
const BLUEPRINT_FIELDS = new Set(['apiVersion', 'rules']);
const BLUEPRINT_RULE_FIELDS = new Set(['id', 'trigger', 'actions']);
const BLUEPRINT_TRIGGER_FIELDS = new Set(['type', 'componentId', 'eventName']);
const SET_VARIABLE_ACTION_FIELDS = new Set(['type', 'variableName', 'value']);
const EMIT_HOST_EVENT_ACTION_FIELDS = new Set(['type', 'eventName', 'payload']);

type ZodIssueLike = {
  readonly path: readonly PropertyKey[];
  readonly message: string;
};

export function validateDocument(
  input: unknown,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase = 'root',
): ScreenDocument | undefined {
  const at = (path: DiagnosticSegment[]): DiagnosticSegment[] =>
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

  const candidate = cloneJsonValue(input) as unknown as Record<string, unknown>;
  const diagnosticsBefore = collector.count;
  checkStrictObjectKeys(candidate, DOCUMENT_ROOT_FIELDS, at([]), collector, phase);
  validateCanvas(candidate.canvas, at, collector, phase);

  const components = candidate.components;
  if (!Array.isArray(components)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['components']),
      phase,
      'Expected components to be an array.',
    );
  } else if (components.length > MAX_COMPONENTS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['components']),
      phase,
      `Document has more than ${MAX_COMPONENTS} components.`,
    );
  } else {
    for (let index = 0; index < components.length; index++) {
      if (collector.full) {
        break;
      }
      validateComponent(components[index], ['components', index], at, collector, phase);
    }
  }

  const variables = candidate.variables;
  if (!Array.isArray(variables)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['variables']),
      phase,
      'Expected variables to be an array.',
    );
  } else if (variables.length > MAX_VARIABLES) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['variables']),
      phase,
      `Document has more than ${MAX_VARIABLES} variables.`,
    );
  } else {
    for (let index = 0; index < variables.length; index++) {
      if (collector.full) {
        break;
      }
      validateVariable(variables[index], index, at, collector, phase);
    }
  }

  validateBlueprint(candidate.blueprint, at, collector, phase);

  if (collector.count > diagnosticsBefore) {
    return undefined;
  }

  const document = candidate as unknown as ScreenDocument;
  if (!validateReferences(document, at, collector, phase)) {
    return undefined;
  }
  return document;
}

function validateCanvas(
  canvas: unknown,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(canvas)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['canvas']),
      phase,
      'Expected canvas to be an object.',
    );
    return false;
  }
  if (
    !checkStrictObjectKeys(
      canvas,
      CANVAS_FIELDS,
      at(['canvas']),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const result = canvasSchema.safeParse(canvas);
  if (!result.success) {
    addZodIssues(result.error.issues, ['canvas'], canvasFieldCode, at, collector, phase);
    return false;
  }
  let clean = true;
  const backgroundColor = canvas.backgroundColor as string;
  if (codePointLength(backgroundColor) > MAX_BACKGROUND_COLOR_CODE_POINTS) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['canvas', 'backgroundColor']),
      phase,
      `Canvas backgroundColor exceeds ${MAX_BACKGROUND_COLOR_CODE_POINTS} code points.`,
    );
    clean = false;
  }
  if (hasControlCharacter(backgroundColor)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['canvas', 'backgroundColor']),
      phase,
      'Canvas backgroundColor must not contain control characters.',
    );
    clean = false;
  }
  return clean;
}

function validateComponent(
  component: unknown,
  baseSegments: DiagnosticSegment[],
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(component)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(baseSegments),
      phase,
      'Expected a component to be an object.',
    );
    return false;
  }
  if (
    !checkStrictObjectKeys(
      component,
      COMPONENT_FIELDS,
      at(baseSegments),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const position = component.position;
  if (
    isJsonObject(position) &&
    !checkStrictObjectKeys(
      position,
      POSITION_FIELDS,
      at([...baseSegments, 'position']),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const size = component.size;
  if (
    isJsonObject(size) &&
    !checkStrictObjectKeys(
      size,
      SIZE_FIELDS,
      at([...baseSegments, 'size']),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const status = component.status;
  if (
    isJsonObject(status) &&
    !checkStrictObjectKeys(
      status,
      STATUS_FIELDS,
      at([...baseSegments, 'status']),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const dataSource = component.dataSource;
  if (isJsonObject(dataSource)) {
    const fields =
      dataSource.type === 'host-resource'
        ? HOST_RESOURCE_DATA_SOURCE_FIELDS
        : STATIC_DATA_SOURCE_FIELDS;
    if (
      !checkStrictObjectKeys(
        dataSource,
        fields,
        at([...baseSegments, 'dataSource']),
        collector,
        phase,
        'DOCUMENT_UNKNOWN_FIELD',
      )
    ) {
      return false;
    }
  }
  const result = componentSchema.safeParse(component);
  if (!result.success) {
    addZodIssues(result.error.issues, baseSegments, componentFieldCode, at, collector, phase);
    return false;
  }
  let clean = true;
  const name = component.name as string;
  if (codePointLength(name) > MAX_NAME_CODE_POINTS) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...baseSegments, 'name']),
      phase,
      `Component name exceeds ${MAX_NAME_CODE_POINTS} code points.`,
    );
    clean = false;
  }
  if (hasControlCharacter(name)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...baseSegments, 'name']),
      phase,
      'Component name must not contain control characters.',
    );
    clean = false;
  }
  if (!/\S/.test(name)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...baseSegments, 'name']),
      phase,
      'Component name must contain at least one non-whitespace character.',
    );
    clean = false;
  }
  if (
    dataSource !== null &&
    typeof dataSource === 'object' &&
    !Array.isArray(dataSource) &&
    (dataSource as Record<string, unknown>).type === 'static'
  ) {
    const value = (dataSource as Record<string, unknown>).value as ScreenJsonValue;
    if (canonicalByteLength(value) > MAX_DATA_SOURCE_VALUE_BYTES) {
      collector.add(
        'DOCUMENT_LIMIT_EXCEEDED',
        at([...baseSegments, 'dataSource', 'value']),
        phase,
        `Static data source value exceeds ${MAX_DATA_SOURCE_VALUE_BYTES} UTF-8 bytes.`,
      );
      clean = false;
    }
  }
  return clean;
}

function validateBlueprint(
  blueprint: unknown,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(blueprint)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['blueprint']),
      phase,
      'Blueprint must be an object.',
    );
    return false;
  }
  if (!checkStrictObjectKeys(blueprint, BLUEPRINT_FIELDS, at(['blueprint']), collector, phase)) {
    return false;
  }
  if (Array.isArray(blueprint.rules)) {
    for (let index = 0; index < blueprint.rules.length; index++) {
      const rule = blueprint.rules[index];
      const base = ['blueprint', 'rules', index] as DiagnosticSegment[];
      if (
        !isJsonObject(rule) ||
        !checkStrictObjectKeys(rule, BLUEPRINT_RULE_FIELDS, at(base), collector, phase)
      ) {
        continue;
      }
      if (
        isJsonObject(rule.trigger) &&
        !checkStrictObjectKeys(
          rule.trigger,
          BLUEPRINT_TRIGGER_FIELDS,
          at([...base, 'trigger']),
          collector,
          phase,
        )
      ) {
        continue;
      }
      if (!Array.isArray(rule.actions)) {
        continue;
      }
      for (let actionIndex = 0; actionIndex < rule.actions.length; actionIndex++) {
        const action = rule.actions[actionIndex];
        if (!isJsonObject(action)) {
          continue;
        }
        const fields =
          action.type === 'set-variable'
            ? SET_VARIABLE_ACTION_FIELDS
            : EMIT_HOST_EVENT_ACTION_FIELDS;
        checkStrictObjectKeys(
          action,
          fields,
          at([...base, 'actions', actionIndex]),
          collector,
          phase,
        );
      }
    }
  }
  const result = blueprintSchema.safeParse(blueprint);
  if (!result.success) {
    addZodIssues(
      result.error.issues,
      ['blueprint'],
      () => 'DOCUMENT_FIELD_INVALID',
      at,
      collector,
      phase,
    );
    return false;
  }
  const rules = blueprint.rules as readonly unknown[];
  if (rules.length > MAX_BLUEPRINT_RULES) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['blueprint', 'rules']),
      phase,
      'Blueprint has too many rules.',
    );
    return false;
  }
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index] as { readonly actions: readonly unknown[] };
    if (rule.actions.length > MAX_BLUEPRINT_ACTIONS_PER_RULE) {
      collector.add(
        'DOCUMENT_LIMIT_EXCEEDED',
        at(['blueprint', 'rules', index, 'actions']),
        phase,
        'Blueprint rule has too many actions.',
      );
    }
  }
  return true;
}

function validateVariable(
  variable: unknown,
  index: number,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const base = at(['variables', index]);
  if (!isJsonObject(variable)) {
    collector.add('DOCUMENT_FIELD_INVALID', base, phase, 'Expected a variable to be an object.');
    return false;
  }
  if (
    !checkStrictObjectKeys(
      variable,
      VARIABLE_FIELDS,
      base,
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const result = staticVariableSchema.safeParse(variable);
  if (!result.success) {
    addZodIssues(
      result.error.issues,
      ['variables', index],
      variableFieldCode,
      at,
      collector,
      phase,
    );
    return false;
  }
  return true;
}

function checkStrictObjectKeys(
  value: Record<string, unknown>,
  known: ReadonlySet<string>,
  base: DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
  code: ScreenDiagnosticCode = 'DOCUMENT_UNKNOWN_FIELD',
): boolean {
  let clean = true;
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      collector.add(code, [...base, key], phase, `Unknown field "${truncateKey(key)}".`);
      clean = false;
    }
  }
  return clean;
}

function addZodIssues(
  issues: readonly ZodIssueLike[],
  baseSegments: DiagnosticSegment[],
  codeForField: (field: string) => ScreenDiagnosticCode,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  for (const issue of issues) {
    if (collector.full) {
      return;
    }
    const path: DiagnosticSegment[] = [];
    for (const segment of issue.path) {
      if (typeof segment === 'string' || typeof segment === 'number') {
        path.push(segment);
      }
    }
    const first = path[0];
    const code = typeof first === 'string' ? codeForField(first) : 'DOCUMENT_FIELD_INVALID';
    collector.add(code, at([...baseSegments, ...path]), phase, issue.message);
  }
}

function canvasFieldCode(_field: string): ScreenDiagnosticCode {
  return 'DOCUMENT_FIELD_INVALID';
}

function componentFieldCode(field: string): ScreenDiagnosticCode {
  if (field === 'position' || field === 'size' || field === 'rotation' || field === 'zIndex') {
    return 'COMPONENT_GEOMETRY_INVALID';
  }
  if (field === 'type') {
    return 'COMPONENT_TYPE_INVALID';
  }
  return 'DOCUMENT_FIELD_INVALID';
}

function variableFieldCode(field: string): ScreenDiagnosticCode {
  if (field === 'name') {
    return 'VARIABLE_NAME_INVALID';
  }
  return 'DOCUMENT_FIELD_INVALID';
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function truncateKey(key: string): string {
  return key.length > 128 ? `${key.slice(0, 128)}…` : key;
}
