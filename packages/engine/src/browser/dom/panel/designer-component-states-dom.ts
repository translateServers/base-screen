import {
  MAX_COMPONENT_STATE_CASES,
  MAX_COMPONENT_STATES,
  readScreenThemeColor,
  readScreenVariableRecord,
  type ScreenComponentNode,
  type ScreenComponentStateInput,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenLevelScale,
  screenThemeRef,
  testScreenComponentStateCase,
} from '@base-screen/contracts';
import {
  DESIGNER_DEFAULT_STATE_ID,
  DESIGNER_STATE_OPERATORS,
  designerStateOverrideCount,
  formatDesignerStateValue,
} from '../../../common/operations/style/designer-component-states.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerFieldRow } from '../designer-field-primitives.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  createDesignerButton,
  createDesignerIconButton,
  createDesignerInput,
  createDesignerSelect,
} from '../designer-ui-primitives.js';
import { appendSection } from './designer-panel-primitives.js';

/** 检查器渲染组件状态所需的会话信息（ADR-0110 §2.5）。 */
export interface DesignerComponentStateContext {
  /** 当前编辑对象：`default` 或某个状态 id（会话态，不写文档）。 */
  readonly editingStateId: (component: ScreenComponentNode) => string;
  /** 画布上的实时判定：生效状态与取值；读不到返回 undefined。 */
  readonly readRuntime: (
    componentId: string,
  ) => { readonly stateId: string; readonly value?: ScreenJsonValue } | undefined;
  /** 判定取值对应的宿主分级表；没有返回 undefined。 */
  readonly levelScale: (
    component: ScreenComponentNode,
    input: ScreenComponentStateInput,
  ) => ScreenLevelScale | undefined;
}

const TEXT = DESIGNER_UI_TEXT.propertiesPanel;

/** 「状态」段：一排状态标签（默认 + 已声明状态 + 新建），编辑非默认状态时多一行改名与操作。 */
export function appendComponentStatesSection(
  properties: HTMLElement,
  component: ScreenComponentNode,
  editingStateId: string,
  context: DesignerComponentStateContext,
): void {
  const doc = properties.ownerDocument;
  const section = appendSection(
    properties,
    TEXT.componentStates,
    false,
    undefined,
    'component-states',
  );
  section.className += ' designer-component-states-section';
  section.dataset.stateComponent = component.id;
  const live = context.readRuntime(component.id)?.stateId ?? DESIGNER_DEFAULT_STATE_ID;
  const chips = doc.createElement('div');
  chips.className = 'designer-state-chips';
  const items = [
    { id: DESIGNER_DEFAULT_STATE_ID, name: TEXT.stateDefault },
    ...(component.states?.items ?? []),
  ];
  for (const item of items) {
    const chip = createDesignerButton(doc, {
      text: item.name,
      className: 'designer-state-chip',
      pressed: item.id === editingStateId,
      ...(item.id === live ? { tip: TEXT.stateLive } : {}),
    });
    chip.dataset.stateAction = 'select';
    chip.dataset.stateId = item.id;
    if (item.id === live) chip.dataset.stateLive = '';
    chips.appendChild(chip);
  }
  const add = createDesignerIconButton(doc, {
    icon: 'plus',
    label: TEXT.stateAdd,
    className: 'designer-state-chip designer-state-add',
    disabled: (component.states?.items.length ?? 0) >= MAX_COMPONENT_STATES,
  });
  add.dataset.stateAction = 'add';
  chips.appendChild(add);
  section.appendChild(chips);
  const editing = component.states?.items.find((item) => item.id === editingStateId);
  if (editing === undefined) return;
  const strip = doc.createElement('div');
  strip.className = 'designer-state-strip';
  const name = createDesignerInput(doc, {
    value: editing.name,
    ariaLabel: TEXT.stateRename,
    className: 'designer-state-name',
  });
  name.dataset.stateName = editing.id;
  strip.appendChild(name);
  const count = designerStateOverrideCount(component.states, editing.id);
  const summary = doc.createElement('span');
  summary.className = 'designer-state-summary';
  summary.textContent = count === 0 ? TEXT.stateUnchanged : TEXT.stateOverrideCount(count);
  strip.appendChild(summary);
  const index = component.states?.items.findIndex((item) => item.id === editing.id) ?? 0;
  const total = component.states?.items.length ?? 0;
  const actions: readonly [
    string,
    Parameters<typeof createDesignerIconButton>[1]['icon'],
    string,
    boolean,
  ][] = [
    ['reset-all', 'reset', TEXT.stateResetAll, count === 0],
    ['duplicate', 'duplicate', TEXT.stateDuplicate, total >= MAX_COMPONENT_STATES],
    ['move-up', 'arrow-up', TEXT.stateMoveUp, index <= 0],
    ['move-down', 'arrow-down', TEXT.stateMoveDown, index >= total - 1],
    ['remove', 'trash', TEXT.stateRemove, false],
  ];
  for (const [action, icon, label, disabled] of actions) {
    const button = createDesignerIconButton(doc, { icon, label, size: 'compact', disabled });
    button.dataset.stateAction = action;
    button.dataset.stateId = editing.id;
    strip.appendChild(button);
  }
  section.appendChild(strip);
}

/** 「判定」段：取值、按行查找、当前结果、按分级生成与有序条件（ADR-0110 §2.5）。 */
export function appendComponentJudgeSection(
  properties: HTMLElement,
  component: ScreenComponentNode,
  document: ScreenDocument,
  context: DesignerComponentStateContext,
): void {
  const states = component.states;
  if (states === undefined) return;
  const doc = properties.ownerDocument;
  const section = appendSection(
    properties,
    TEXT.stateJudge,
    false,
    undefined,
    'component-state-judge',
  );
  section.className += ' designer-component-judge-section';
  section.dataset.stateComponent = component.id;
  const input: ScreenComponentStateInput = states.judge?.input ?? {
    kind: 'component-data',
    path: [],
  };
  const variables = document.variables.map((entry) => readScreenVariableRecord(entry));
  const dataSources = document.dataSources ?? [];

  const inputRow = createDesignerFieldRow(doc, { label: TEXT.stateJudgeInput });
  const options = [
    { value: 'component-data', label: TEXT.stateInputComponentData },
    ...variables.map((variable) => ({
      value: `variable:${variable.id}`,
      label: `${TEXT.stateInputVariable} · ${variable.name}`,
    })),
    ...dataSources.map((source) => ({
      value: `data-source:${source.id}`,
      label: `${TEXT.stateInputDataSource} · ${source.name}`,
    })),
  ];
  const selected =
    input.kind === 'component-data'
      ? 'component-data'
      : input.kind === 'variable'
        ? `variable:${input.variableId}`
        : `data-source:${input.dataSourceId}`;
  const inputSelect = createDesignerSelect(doc, {
    options: options.map((option) => ({ ...option, selected: option.value === selected })),
    ariaLabel: TEXT.stateJudgeInput,
  });
  inputSelect.dataset.stateInput = '';
  inputRow.control.appendChild(enhanceDesignerSelect(inputSelect).element);
  section.appendChild(inputRow.field);

  if (input.kind === 'data-source-field') {
    const fieldRow = createDesignerFieldRow(doc, { label: TEXT.stateRowMatch });
    const field = createDesignerInput(doc, {
      value: input.where?.field.join('.') ?? '',
      placeholder: TEXT.stateRowField,
      ariaLabel: TEXT.stateRowField,
    });
    field.dataset.stateRowField = '';
    fieldRow.control.appendChild(field);
    section.appendChild(fieldRow.field);
    if (input.where !== undefined) {
      const equalsRow = createDesignerFieldRow(doc, { label: TEXT.stateRowValue });
      const equals = input.where.equals;
      const equalsSelect = createDesignerSelect(doc, {
        options: [
          { value: 'literal', label: TEXT.stateRowLiteral, selected: equals.kind === 'literal' },
          ...variables.map((variable) => ({
            value: `variable:${variable.id}`,
            label: `${TEXT.stateInputVariable} · ${variable.name}`,
            selected: equals.kind === 'variable' && equals.variableId === variable.id,
          })),
        ],
        ariaLabel: TEXT.stateRowValue,
      });
      equalsSelect.dataset.stateRowEquals = '';
      equalsRow.control.appendChild(enhanceDesignerSelect(equalsSelect).element);
      if (equals.kind === 'literal') {
        const literal = createDesignerInput(doc, {
          value: formatDesignerStateValue(equals.value),
          ariaLabel: TEXT.stateRowLiteral,
        });
        literal.dataset.stateRowLiteral = '';
        equalsRow.control.appendChild(literal);
      }
      section.appendChild(equalsRow.field);
    }
  }

  const pathRow = createDesignerFieldRow(doc, { label: TEXT.stateInputPath });
  const path = createDesignerInput(doc, {
    value: input.path.join('.'),
    placeholder: TEXT.stateInputPathPlaceholder,
    ariaLabel: TEXT.stateInputPath,
  });
  path.dataset.stateInputPath = '';
  pathRow.control.appendChild(path);
  section.appendChild(pathRow.field);

  const runtime = context.readRuntime(component.id);
  const stateName = (id: string) =>
    id === DESIGNER_DEFAULT_STATE_ID
      ? TEXT.stateDefault
      : (states.items.find((item) => item.id === id)?.name ?? id);
  const scale = context.levelScale(component, input);
  const levelLabel = (value: ScreenJsonValue | undefined) =>
    scale?.levels.find((level) => level.value === value)?.label;
  const now = doc.createElement('p');
  now.className = 'designer-state-now';
  const value = runtime?.value;
  const valueText =
    value === undefined || value === null
      ? TEXT.stateEmptyValue
      : (levelLabel(value) ?? formatDesignerStateValue(value));
  now.textContent = `${TEXT.stateCurrent} ${valueText} → ${stateName(runtime?.stateId ?? DESIGNER_DEFAULT_STATE_ID)}`;
  section.appendChild(now);

  if (
    scale !== undefined &&
    !scale.levels.every((level) => states.items.some((item) => item.id === String(level.value)))
  ) {
    const generate = doc.createElement('div');
    generate.className = 'designer-state-generate';
    const legend = doc.createElement('span');
    legend.className = 'designer-state-levels';
    legend.textContent = `${TEXT.stateLevelScale}：`;
    for (const level of scale.levels) {
      const swatch = doc.createElement('i');
      swatch.className = 'designer-state-level-swatch';
      swatch.dataset.tone = level.tone;
      swatch.title = screenThemeRef(level.tone);
      swatch.style.setProperty(
        '--designer-state-tone',
        readScreenThemeColor(document.theme, level.tone) ?? '',
      );
      legend.appendChild(swatch);
      legend.append(level.label);
    }
    generate.appendChild(legend);
    const button = createDesignerButton(doc, {
      text: TEXT.stateGenerate,
      className: 'designer-state-generate-button',
    });
    button.dataset.stateAction = 'generate';
    generate.appendChild(button);
    section.appendChild(generate);
  }

  const cases = states.judge?.cases ?? [];
  const hit =
    runtime === undefined
      ? -1
      : cases.findIndex(
          (entry) =>
            entry.stateId === runtime.stateId && testScreenComponentStateCase(entry, value),
        );
  const list = doc.createElement('div');
  list.className = 'designer-state-cases';
  cases.forEach((entry, index) => {
    const row = doc.createElement('div');
    row.className = 'designer-state-case';
    row.dataset.stateCaseIndex = String(index);
    if (index === hit) row.dataset.stateCaseHit = '';
    const operator = createDesignerSelect(doc, {
      options: DESIGNER_STATE_OPERATORS.map((op) => ({
        value: op,
        label: TEXT.stateOperators[op],
        selected: op === entry.operator,
      })),
      ariaLabel: TEXT.stateOperators[entry.operator],
    });
    operator.dataset.stateCaseOperator = '';
    row.appendChild(enhanceDesignerSelect(operator).element);
    if (scale !== undefined && (entry.operator === 'eq' || entry.operator === 'neq')) {
      const levels = createDesignerSelect(doc, {
        options: scale.levels.map((level) => ({
          value: JSON.stringify(level.value),
          label: level.label,
          selected: level.value === entry.value,
        })),
        ariaLabel: TEXT.stateCaseValue,
      });
      levels.dataset.stateCaseLevel = '';
      row.appendChild(enhanceDesignerSelect(levels).element);
    } else {
      const caseValue = createDesignerInput(doc, {
        value: formatDesignerStateValue(entry.value),
        ariaLabel: TEXT.stateCaseValue,
        disabled: entry.operator === 'exists',
      });
      caseValue.dataset.stateCaseValue = '';
      row.appendChild(caseValue);
    }
    const arrow = doc.createElement('span');
    arrow.className = 'designer-state-case-arrow';
    arrow.textContent = '→';
    row.appendChild(arrow);
    const target = createDesignerSelect(doc, {
      options: states.items.map((item) => ({
        value: item.id,
        label: item.name,
        selected: item.id === entry.stateId,
      })),
      ariaLabel: TEXT.stateCaseTarget,
    });
    target.dataset.stateCaseState = '';
    row.appendChild(enhanceDesignerSelect(target).element);
    const remove = createDesignerIconButton(doc, {
      icon: 'close',
      label: TEXT.stateCaseRemove,
      size: 'compact',
    });
    remove.dataset.stateAction = 'remove-case';
    row.appendChild(remove);
    list.appendChild(row);
  });
  const other = doc.createElement('div');
  other.className = 'designer-state-case designer-state-case-other';
  if (runtime !== undefined && hit < 0 && runtime.stateId === DESIGNER_DEFAULT_STATE_ID) {
    other.dataset.stateCaseHit = '';
  }
  other.textContent = `${TEXT.stateCaseOther} → ${TEXT.stateDefault}`;
  list.appendChild(other);
  section.appendChild(list);
  const addCase = createDesignerButton(doc, {
    text: TEXT.stateCaseAdd,
    className: 'designer-state-case-add',
    disabled: cases.length >= MAX_COMPONENT_STATE_CASES,
  });
  addCase.dataset.stateAction = 'add-case';
  section.appendChild(addCase);
}

/** 编辑非默认状态时标出被覆盖的外观字段，并在行尾放「恢复默认」。 */
export function markDesignerStateOverrides(
  properties: HTMLElement,
  component: ScreenComponentNode,
  stateId: string,
): void {
  const item = component.states?.items.find((candidate) => candidate.id === stateId);
  if (item === undefined) return;
  for (const key of Object.keys(item.style)) {
    const control = properties.querySelector<HTMLElement>(`[data-style="${escapeAttribute(key)}"]`);
    const field = control?.closest<HTMLElement>('.designer-field');
    if (field === null || field === undefined || field.dataset.stateOverride !== undefined)
      continue;
    field.dataset.stateOverride = key;
    const reset = createDesignerIconButton(properties.ownerDocument, {
      icon: 'reset',
      label: DESIGNER_UI_TEXT.propertiesPanel.stateResetKey,
      size: 'compact',
      className: 'designer-state-reset-key',
    });
    reset.dataset.stateAction = 'reset-key';
    reset.dataset.stateKey = key;
    reset.dataset.stateId = stateId;
    reset.dataset.stateComponentRef = component.id;
    // 放在控件列末尾：字段行是 <label> 时，排在控件之后的按钮不会被当成标签的被标注控件。
    // 状态模式下物料默认值的复位没有意义（覆盖要么存在、要么去掉），由这个按钮取代。
    field.querySelector('.designer-field-reset')?.remove();
    (field.querySelector<HTMLElement>('.designer-field-control') ?? field).appendChild(reset);
  }
}

/** 位置尺寸与状态开关不随状态变化：编辑非默认状态时整段只读。 */
export function freezeDesignerStateSections(properties: HTMLElement): void {
  for (const key of ['geometry', 'status']) {
    const section = properties.querySelector<HTMLElement>(`[data-inspector-search-key="${key}"]`);
    const scope = section ?? undefined;
    if (scope === undefined) continue;
    scope.dataset.stateFrozen = '';
    for (const control of scope.querySelectorAll<
      HTMLInputElement | HTMLButtonElement | HTMLSelectElement
    >('input, button, select')) {
      control.disabled = true;
    }
  }
}

/** 样式键是物料声明的标识符；这里只转义属性选择器里有意义的两个字符。 */
function escapeAttribute(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
