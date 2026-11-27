import {
  DEFAULT_SCREEN_COMPONENT_STATE_ID,
  isScreenComponentId,
  MAX_COMPONENT_STATE_CASES,
  MAX_COMPONENT_STATE_NAME_CODE_POINTS,
  MAX_COMPONENT_STATES,
  readScreenComponentValueRef,
  type ScreenComponentNode,
  type ScreenComponentState,
  type ScreenComponentStateCase,
  type ScreenComponentStateInput,
  type ScreenComponentStates,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenLevelScale,
  type ScreenLevelTone,
  type ScreenParseResult,
  screenJsonEquals,
} from '@base-screen/contracts';
import {
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenStatePresetSource,
  screenStatePresetStyle,
} from '@base-screen/core';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialManifest,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import { designerMaterialEditorKeys } from './designer-material-appearance.js';

/**
 * 组件状态的作者面纯逻辑（ADR-0110 §2.5、§2.6.3）：状态增删改、判定编辑、样式改动重定向、
 * 按分级生成。只产出文档事务，不碰 DOM；显示文案由调用方传入。
 */

export const DESIGNER_DEFAULT_STATE_ID = DEFAULT_SCREEN_COMPONENT_STATE_ID;

export const DESIGNER_STATE_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'exists',
] as const;

export type DesignerStateOperator = (typeof DESIGNER_STATE_OPERATORS)[number];

export interface DesignerStateMessages {
  readonly invalid: string;
  readonly limit: (limit: number) => string;
}

const DEFAULT_MESSAGES: DesignerStateMessages = {
  invalid: 'Component states are invalid.',
  limit: (limit) => `At most ${limit} states are allowed.`,
};

export function nextDesignerStateId(states: ScreenComponentStates | undefined): string {
  const taken = new Set(states?.items.map((item) => item.id) ?? []);
  let index = (states?.items.length ?? 0) + 1;
  while (taken.has(`state-${index}`)) index += 1;
  return `state-${index}`;
}

export function withDesignerStateAdded(
  states: ScreenComponentStates | undefined,
  name: string,
): { readonly states: ScreenComponentStates; readonly stateId: string } {
  const stateId = nextDesignerStateId(states);
  const item: ScreenComponentState = { id: stateId, name: clampName(name), style: {} };
  return {
    stateId,
    states: { ...(states ?? {}), items: [...(states?.items ?? []), item] },
  };
}

export function withDesignerStateRenamed(
  states: ScreenComponentStates,
  stateId: string,
  name: string,
): ScreenComponentStates {
  const trimmed = clampName(name.trim());
  if (trimmed === '') return states;
  return mapItems(states, stateId, (item) => ({ ...item, name: trimmed }));
}

export function withDesignerStateDuplicated(
  states: ScreenComponentStates,
  stateId: string,
  suffix: string,
): { readonly states: ScreenComponentStates; readonly stateId: string } | undefined {
  const index = states.items.findIndex((item) => item.id === stateId);
  if (index < 0 || states.items.length >= MAX_COMPONENT_STATES) return undefined;
  const source = states.items[index]!;
  const copyId = nextDesignerStateId(states);
  const items = [...states.items];
  items.splice(index + 1, 0, {
    id: copyId,
    name: clampName(`${source.name}${suffix}`),
    style: { ...source.style },
  });
  return { stateId: copyId, states: { ...states, items } };
}

export function withDesignerStateMoved(
  states: ScreenComponentStates,
  stateId: string,
  offset: -1 | 1,
): ScreenComponentStates | undefined {
  const index = states.items.findIndex((item) => item.id === stateId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= states.items.length) return undefined;
  const items = [...states.items];
  [items[index], items[target]] = [items[target]!, items[index]!];
  return { ...states, items };
}

/** 删除状态：指向它的判定条件一并去掉；最后一个状态删除后返回 null（整个 `states` 去掉）。 */
export function withDesignerStateRemoved(
  states: ScreenComponentStates,
  stateId: string,
): ScreenComponentStates | null {
  const items = states.items.filter((item) => item.id !== stateId);
  if (items.length === 0) return null;
  if (states.judge === undefined) return { items };
  return {
    items,
    judge: {
      ...states.judge,
      cases: states.judge.cases.filter((entry) => entry.stateId !== stateId),
    },
  };
}

/** 恢复某状态的覆盖：`keys` 缺省即全部恢复。 */
export function withDesignerStateKeysReset(
  states: ScreenComponentStates,
  stateId: string,
  keys?: readonly string[],
): ScreenComponentStates {
  return mapItems(states, stateId, (item) => {
    if (keys === undefined) return { ...item, style: {} };
    const style = { ...item.style };
    for (const key of keys) delete style[key];
    return { ...item, style };
  });
}

export function withDesignerJudgeInput(
  states: ScreenComponentStates,
  input: ScreenComponentStateInput,
): ScreenComponentStates {
  return { ...states, judge: { input, cases: states.judge?.cases ?? [] } };
}

export function withDesignerCaseAdded(
  states: ScreenComponentStates,
  value: ScreenJsonValue,
): ScreenComponentStates | undefined {
  const cases = states.judge?.cases ?? [];
  const last = states.items[states.items.length - 1];
  if (last === undefined || cases.length >= MAX_COMPONENT_STATE_CASES) return undefined;
  return {
    ...states,
    judge: {
      input: states.judge?.input ?? { kind: 'component-data', path: [] },
      cases: [...cases, { operator: 'eq', value, stateId: last.id }],
    },
  };
}

export function withDesignerCaseUpdated(
  states: ScreenComponentStates,
  index: number,
  update: Partial<ScreenComponentStateCase>,
): ScreenComponentStates {
  const judge = states.judge;
  if (judge === undefined || judge.cases[index] === undefined) return states;
  const current = judge.cases[index]!;
  const operator = update.operator ?? current.operator;
  const value = 'value' in update ? update.value : current.value;
  const next: ScreenComponentStateCase =
    operator === 'exists'
      ? { operator, stateId: update.stateId ?? current.stateId }
      : { operator, value: value ?? '', stateId: update.stateId ?? current.stateId };
  return {
    ...states,
    judge: { ...judge, cases: judge.cases.map((entry, at) => (at === index ? next : entry)) },
  };
}

export function withDesignerCaseRemoved(
  states: ScreenComponentStates,
  index: number,
): ScreenComponentStates {
  const judge = states.judge;
  if (judge === undefined) return states;
  return { ...states, judge: { ...judge, cases: judge.cases.filter((_, at) => at !== index) } };
}

/** 比较值：先按 JSON 解析（数字 / 布尔 / null），失败则当字符串。 */
export function parseDesignerStateValue(input: string): ScreenJsonValue {
  const trimmed = input.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed) as ScreenJsonValue;
  } catch {
    return input;
  }
}

export function formatDesignerStateValue(value: ScreenJsonValue | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function parseDesignerStatePath(input: string): readonly string[] | null {
  const trimmed = input.trim();
  if (trimmed === '') return [];
  const segments = trimmed.split('.').map((segment) => segment.trim());
  return segments.some((segment) => segment === '') || segments.length > 8 ? null : segments;
}

/**
 * 编辑非默认状态时的样式重定向（ADR-0110 §2.5）：把落到该组件 `style` 上的整体替换改写成该状态的覆盖。
 *
 * 检查器的样式提交以文档里的基础样式为底、改其中若干键；与基础值不同的键写进覆盖（叠加在已有覆盖上），
 * 其它命令与其它组件原样保留。改回默认值用字段的「恢复」按钮。
 */
export function redirectDesignerStyleTransaction(
  document: ScreenDocument,
  componentId: string,
  stateId: string,
  transaction: ScreenDocumentTransaction,
): ScreenDocumentTransaction {
  if (stateId === DESIGNER_DEFAULT_STATE_ID) return transaction;
  const component = document.components.find((item) => item.id === componentId);
  const states = component?.states;
  if (component === undefined || states === undefined) return transaction;
  if (!states.items.some((item) => item.id === stateId)) return transaction;
  let changed = false;
  const commands = transaction.commands.map((command): ScreenDocumentCommand => {
    if (
      command.type !== 'update-components' ||
      command.componentIds.length !== 1 ||
      command.componentIds[0] !== componentId ||
      command.patch.style === undefined
    ) {
      return command;
    }
    changed = true;
    const { style, ...rest } = command.patch;
    const next = mapItems(states, stateId, (item) => {
      const override: Record<string, ScreenJsonValue> = { ...item.style };
      for (const [key, value] of Object.entries(style)) {
        if (!screenJsonEquals(value, component.style[key])) override[key] = value;
      }
      return { ...item, style: override };
    });
    return { ...command, patch: { ...rest, states: next } };
  });
  return changed ? { ...transaction, commands } : transaction;
}

/**
 * 整体替换组件状态的事务：每个状态的覆盖与基础样式合并后必须通过物料 styleSchema；
 * 去掉的状态（或整个 `states`）连带删除蓝图里指向它的连线（ADR-0110 §2.4）。
 */
export function createDesignerStatesTransaction(
  document: ScreenDocument,
  componentId: string,
  states: ScreenComponentStates | null,
  catalog: BaseScreenMaterialCatalog | undefined,
  messages: DesignerStateMessages = DEFAULT_MESSAGES,
): ScreenParseResult<ScreenDocumentTransaction> {
  const component = document.components.find((candidate) => candidate.id === componentId);
  if (component === undefined) return failure(messages.invalid, ['components']);
  const manifest = catalog?.get(component.type)?.manifest;
  if (manifest === undefined) return failure(messages.invalid, ['states']);
  if (states !== null) {
    if (states.items.length > MAX_COMPONENT_STATES) {
      return failure(messages.limit(MAX_COMPONENT_STATES), ['states', 'items']);
    }
    for (const [index, item] of states.items.entries()) {
      if (!isScreenComponentId(item.id) || item.id === DESIGNER_DEFAULT_STATE_ID) {
        return failure(messages.invalid, ['states', 'items', index, 'id']);
      }
      const validated = validateBaseScreenMaterialStyle(
        { ...component.style, ...item.style },
        manifest.styleSchema,
      );
      if (!validated.ok) return validated;
    }
  }
  const commands: ScreenDocumentCommand[] = [
    { type: 'update-components', componentIds: [componentId], patch: { states } },
  ];
  const pruned = pruneStateEdges(document, componentId, states);
  if (pruned !== undefined) commands.push(pruned);
  return { ok: true, value: { commands }, diagnostics: [] };
}

function pruneStateEdges(
  document: ScreenDocument,
  componentId: string,
  states: ScreenComponentStates | null,
): ScreenDocumentCommand | undefined {
  const node = document.blueprint.nodes.find(
    (candidate) => candidate.kind === 'component' && candidate.componentId === componentId,
  );
  if (node === undefined) return undefined;
  const ids = new Set(states?.items.map((item) => item.id) ?? []);
  const edges = document.blueprint.edges.filter((edge) => {
    if (edge.kind !== 'flow') return true;
    if (edge.from.node === node.id && edge.from.port === 'state-changed') return states !== null;
    if (edge.to.node !== node.id) return true;
    if (edge.to.port === 'reset-state') return states !== null;
    if (edge.to.port === 'set-state') return edge.stateId !== undefined && ids.has(edge.stateId);
    return true;
  });
  if (edges.length === document.blueprint.edges.length) return undefined;
  return { type: 'replace-blueprint', blueprint: { ...document.blueprint, edges } };
}

/** 判定取值对应的宿主分级表（ADR-0110 §2.6.2）：按来源找资源类型 / 目录项声明的分级表，路径相同者胜出。 */
export function findDesignerLevelScale(
  document: ScreenDocument,
  component: ScreenComponentNode,
  input: ScreenComponentStateInput,
  readScales: (dataSourceId: string) => readonly ScreenLevelScale[] | undefined,
): ScreenLevelScale | undefined {
  let dataSourceId: string | undefined;
  let path: readonly string[] = input.path;
  if (input.kind === 'data-source-field') {
    dataSourceId = input.dataSourceId;
  } else if (input.kind === 'component-data') {
    const ref = readScreenComponentValueRef(component);
    if (ref?.kind !== 'data-source-field') return undefined;
    dataSourceId = ref.dataSourceId;
    path = [...ref.path, ...input.path];
  }
  if (dataSourceId === undefined) return undefined;
  if (!(document.dataSources ?? []).some((source) => source.id === dataSourceId)) return undefined;
  return readScales(dataSourceId)?.find(
    (scale) =>
      scale.path.length === path.length && scale.path.every((segment, at) => segment === path[at]),
  );
}

/**
 * 状态外观预置的入参（ADR-0115 D8）：从 manifest 的外观区摊平出 core 要的键表。
 * 宿主把它随智能体目录上送，智能体生成的阈值状态与「按分级生成状态」就用同一套规则。
 */
export function readDesignerStatePresetSource(
  manifest: BaseScreenMaterialManifest,
): ScreenStatePresetSource {
  const declared = manifest.statePresetKeys;
  if (declared !== undefined) {
    return {
      declared: declared.map((key) => ({
        key,
        // 宿主替身里的 manifest 可能不带 styleSchema：缺省当未知类型（不写这个键）。
        kind: manifest.styleSchema?.properties?.[key]?.kind ?? 'unknown',
      })),
      fields: [],
    };
  }
  return {
    fields: designerMaterialEditorKeys(manifest, 'style').map((entry) => ({
      key: entry.key,
      kind: entry.schema.kind,
      ...(entry.field.control === 'color' ? { color: true } : {}),
    })),
  };
}

/** 生成状态时预置覆盖的样式键：规则在 core（`screenStatePresetStyle`），这里只读出 manifest 的键表。 */
export function designerStatePresetStyle(
  manifest: BaseScreenMaterialManifest,
  tone: ScreenLevelTone,
): ScreenJsonObject {
  return screenStatePresetStyle(readDesignerStatePresetSource(manifest), tone);
}

/**
 * 按分级生成状态（ADR-0110 §2.6.3）：为每个尚未存在的等级新建状态并预置覆盖，判定条件重写为
 * 按严重程度排列的「等于 <等级> → <状态>」。已存在的同 id 状态保留作者的改动。
 */
export function withDesignerLevelStates(
  states: ScreenComponentStates | undefined,
  input: ScreenComponentStateInput,
  scale: ScreenLevelScale,
  manifest: BaseScreenMaterialManifest,
): ScreenComponentStates {
  const items = [...(states?.items ?? [])];
  const cases: ScreenComponentStateCase[] = [];
  scale.levels.forEach((level, index) => {
    const preferred = String(level.value);
    const id =
      isScreenComponentId(preferred) && preferred !== DESIGNER_DEFAULT_STATE_ID
        ? preferred
        : `level-${index + 1}`;
    if (!items.some((item) => item.id === id) && items.length < MAX_COMPONENT_STATES) {
      items.push({
        id,
        name: clampName(level.label),
        style: designerStatePresetStyle(manifest, level.tone),
      });
    }
    if (items.some((item) => item.id === id)) {
      cases.push({ operator: 'eq', value: level.value, stateId: id });
    }
  });
  return { items, judge: { input, cases } };
}

export function designerStateOverrideCount(
  states: ScreenComponentStates | undefined,
  stateId: string,
): number {
  const item = states?.items.find((candidate) => candidate.id === stateId);
  return item === undefined ? 0 : Object.keys(item.style).length;
}

/** 编辑非默认状态时检查器读的视图组件：样式 = 基础样式 ⊕ 该状态覆盖。 */
export function designerStateViewComponent(
  component: ScreenComponentNode,
  stateId: string,
): ScreenComponentNode {
  if (stateId === DESIGNER_DEFAULT_STATE_ID) return component;
  const item = component.states?.items.find((candidate) => candidate.id === stateId);
  if (item === undefined || Object.keys(item.style).length === 0) return component;
  return { ...component, style: { ...component.style, ...item.style } };
}

function mapItems(
  states: ScreenComponentStates,
  stateId: string,
  map: (item: ScreenComponentState) => ScreenComponentState,
): ScreenComponentStates {
  return { ...states, items: states.items.map((item) => (item.id === stateId ? map(item) : item)) };
}

function clampName(name: string): string {
  return [...name].slice(0, MAX_COMPONENT_STATE_NAME_CODE_POINTS).join('');
}

function failure(
  message: string,
  path: readonly (string | number)[],
): ScreenParseResult<ScreenDocumentTransaction> {
  const diagnostic: ScreenDiagnostic = {
    severity: 'error',
    code: 'CORE_COMMAND_INVALID',
    path: [...path],
    message,
  };
  return { ok: false, diagnostics: [diagnostic] };
}
