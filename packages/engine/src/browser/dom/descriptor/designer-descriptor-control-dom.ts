import type { ScreenJsonValue } from '@base-screen/contracts';
import {
  type BaseScreenMaterialEditorField,
  type BaseScreenMaterialPropSchema,
  resolveSchema,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerStepper } from '../designer-field-primitives.js';
import { designerIcon } from '../designer-icons.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  createDesignerInput,
  createDesignerSegmented,
  createDesignerSelect,
  createDesignerSwitch,
  createDesignerTextarea,
} from '../designer-ui-primitives.js';
import type {
  DesignerDescriptorContext,
  DesignerDescriptorDatasetFields,
} from './designer-descriptor-model.js';

export interface DescriptorControlHandle {
  /** 挂到字段行里的元素（复合控件时是外壳）。 */
  readonly element: HTMLElement;
  /** 承载值、派发 change、被设计器路由识别的元素。 */
  readonly valueTarget: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  /** 可选：挂到标签旁的字段级动作（四边距的统一/分开）。 */
  readonly labelAction?: HTMLButtonElement;
}

export function createDescriptorControl(
  ownerDocument: Document,
  field: BaseScreenMaterialEditorField,
  schema: BaseScreenMaterialPropSchema | undefined,
  value: ScreenJsonValue | undefined,
  datasetFields: readonly DesignerDescriptorDatasetFields[],
  fieldKey?: string,
): DescriptorControlHandle {
  const control = field.control;
  if (control === 'stepper') {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
    const minimum = field.min ?? (schema?.kind === 'number' ? schema.minimum : undefined) ?? 0;
    const maximum = field.max ?? (schema?.kind === 'number' ? schema.maximum : undefined) ?? 100;
    const stepper = createDesignerStepper(ownerDocument, {
      value: Number.isFinite(numeric) ? numeric : minimum,
      min: minimum,
      max: maximum,
      ...(field.step === undefined ? {} : { step: field.step }),
      ariaLabel: field.label,
    });
    return { element: stepper.element, valueTarget: stepper.input };
  }
  if (control === 'boolean') {
    // Boolean descriptor fields render as the prototype's pill switch, not a checkbox; the native
    // checkbox stays the value carrier so the descriptor read/write pipeline is unchanged.
    const toggle = createDesignerSwitch(ownerDocument, {
      ariaLabel: field.label,
      checked: value === true,
    });
    return { element: toggle, valueTarget: toggle };
  }
  if (control === 'segmented' && schema?.kind === 'enum') {
    // 与对齐分段同款：原生 select 是唯一值载体与 change 源，可见按钮只改值。
    const current = schema.values.some((option) => option === value)
      ? String(value)
      : String(schema.values[0]);
    const select = createDesignerSelect(ownerDocument, {
      ariaLabel: field.label,
      className: 'designer-segmented-native',
      options: schema.values.map((optionValue) => ({
        label: String(optionValue),
        selected: String(optionValue) === current,
        value: String(optionValue),
      })),
      value: current,
    });
    const segmented = createDesignerSegmented(ownerDocument, {
      ariaLabel: field.label,
      selection: 'radio',
      selected: current,
      options: schema.values.map((optionValue) => ({
        value: String(optionValue),
        label: String(optionValue),
      })),
    });
    for (const [optionValue, option] of segmented.buttons) {
      option.addEventListener('click', () => {
        if (select.value === optionValue) return;
        select.value = optionValue;
        for (const [key, candidate] of segmented.buttons) {
          candidate.ariaChecked = String(key === optionValue);
          candidate.tabIndex = key === optionValue ? 0 : -1;
        }
        select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      });
    }
    const shell = ownerDocument.createElement('span');
    shell.className = 'designer-descriptor-segmented';
    shell.append(segmented.element, select);
    return { element: shell, valueTarget: select };
  }
  if (control === 'select' && schema?.kind === 'enum') {
    const select = createDesignerSelect(ownerDocument, {
      options: schema.values.map((optionValue) => ({
        label: String(optionValue),
        selected: value === optionValue,
        value: String(optionValue),
      })),
    });
    // 自绘下拉：外壳进字段行，原生 select 仍是值载体与 change 源。
    const enhanced = enhanceDesignerSelect(select);
    return { element: enhanced.element, valueTarget: select };
  }
  if (control === 'color') {
    const input = createDesignerInput(ownerDocument, {
      appearance: 'color',
      value: typeof value === 'string' ? value : '',
    });
    return { element: input, valueTarget: input };
  }
  if (control === 'json') {
    const input = createDesignerTextarea(ownerDocument);
    input.value = JSON.stringify(value);
    return { element: input, valueTarget: input };
  }
  if (control === 'field-selector') {
    if (datasetFields.length > 0) {
      const select = createDesignerSelect(ownerDocument, {
        ariaLabel: field.label,
        options: [
          {
            label: DESIGNER_UI_TEXT.descriptor.noField,
            selected: value === undefined || value === '',
            value: '',
          },
          ...datasetFields.map((datasetField) => ({
            label: datasetField.label,
            selected: value === datasetField.id,
            value: datasetField.id,
          })),
        ],
      });
      // 与字段映射同一套自绘下拉：原生 select 继续承担取值与 change。
      const enhanced = enhanceDesignerSelect(select);
      return { element: enhanced.element, valueTarget: select };
    }
    const input = createDesignerInput(ownerDocument, {
      value: typeof value === 'string' ? value : '',
    });
    return { element: input, valueTarget: input };
  }
  if (control === 'spacing') {
    return createSpacingControl(ownerDocument, field, schema, value, fieldKey);
  }
  const numeric = control === 'number' || control === 'unit-number';
  const input = createDesignerInput(ownerDocument, {
    appearance: numeric ? 'number' : 'text',
    ...(numeric && field.max !== undefined ? { max: field.max } : {}),
    ...(numeric && field.min !== undefined ? { min: field.min } : {}),
    ...(numeric && field.step !== undefined ? { step: field.step } : {}),
    value: String(value ?? ''),
  });
  if (control === 'unit-number' && field.unit !== undefined && field.unit !== '') {
    // 与步进器同一套复合控件形态：外壳画描边环，单位后缀不参与取值，input 仍是唯一值载体。
    const shell = ownerDocument.createElement('span');
    shell.className = 'designer-unit-input';
    const suffix = ownerDocument.createElement('span');
    suffix.className = 'designer-unit-input-suffix';
    suffix.setAttribute('aria-hidden', 'true');
    suffix.textContent = field.unit;
    shell.append(input, suffix);
    return { element: shell, valueTarget: input };
  }
  return { element: input, valueTarget: input };
}

const SPACING_SIDES = ['top', 'right', 'bottom', 'left'] as const;
type SpacingSide = (typeof SPACING_SIDES)[number];

const MAX_SPACING_LINK_FIELDS = 64;
/** 每个字段的联动状态：面板每次提交都会整栏重建，状态必须活在 DOM 之外。 */
const spacingLinkState = new Map<string, boolean>();

function readSpacingValue(value: ScreenJsonValue | undefined): Record<SpacingSide, number> {
  const source =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const read = (side: SpacingSide): number => {
    const candidate = source[side];
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
  };
  return { top: read('top'), right: read('right'), bottom: read('bottom'), left: read('left') };
}

function allSidesEqual(sides: Record<SpacingSide, number>): boolean {
  return sides.top === sides.right && sides.right === sides.bottom && sides.bottom === sides.left;
}

function readSpacingLinkState(
  fieldKey: string | undefined,
  sides: Record<SpacingSide, number>,
): boolean {
  if (fieldKey !== undefined) {
    const remembered = spacingLinkState.get(fieldKey);
    if (remembered !== undefined) return remembered;
  }
  return allSidesEqual(sides);
}

function rememberSpacingLinkState(fieldKey: string | undefined, linked: boolean): void {
  if (fieldKey === undefined) return;
  spacingLinkState.delete(fieldKey);
  spacingLinkState.set(fieldKey, linked);
  while (spacingLinkState.size > MAX_SPACING_LINK_FIELDS) {
    const oldest = spacingLinkState.keys().next();
    if (oldest.done === true) break;
    spacingLinkState.delete(oldest.value);
  }
}

/**
 * 四边距：一个对象值（top/right/bottom/left）只占一格。
 *
 * 布局按控件实际宽度自适应：够宽时一行四格（30px），窄于 190px 时换成两行两列（60px）。
 * 面板可拖到 276–480px，宽度判断交给 CSS 容器查询，不读面板像素。
 *
 * 四边相等时收成一个输入（联动），标签旁的链图标负责统一/分开：统一把四边写成上边距的值，
 * 走一次事务；分开只改形态、不写文档。联动状态按字段记忆，改写值不会把它重置。
 *
 * 值载体始终是一个隐藏 input（JSON），可见输入只负责改它的值再派发 change：
 * 事务层读 `data-descriptor-*` 与 `target.value`，不需要认识复合控件。
 */
function createSpacingControl(
  ownerDocument: Document,
  field: BaseScreenMaterialEditorField,
  schema: BaseScreenMaterialPropSchema | undefined,
  value: ScreenJsonValue | undefined,
  fieldKey: string | undefined,
): DescriptorControlHandle {
  let values = readSpacingValue(value);
  let linked = readSpacingLinkState(fieldKey, values);

  const scope = ownerDocument.createElement('div');
  scope.className = 'designer-spacing-scope';
  scope.setAttribute('role', 'group');
  scope.setAttribute('aria-label', field.label);
  const frame = ownerDocument.createElement('div');
  frame.className = 'designer-spacing-frame';
  const shell = ownerDocument.createElement('div');
  shell.className = 'designer-spacing';
  frame.appendChild(shell);

  const carrier = createDesignerInput(ownerDocument, { type: 'hidden' });
  const toggle = ownerDocument.createElement('button');
  toggle.type = 'button';
  toggle.className = 'designer-spacing-toggle';

  const unit =
    field.unit === undefined || field.unit === '' ? undefined : ownerDocument.createElement('span');
  if (unit !== undefined) {
    unit.className = 'designer-spacing-unit';
    unit.setAttribute('aria-hidden', 'true');
    unit.textContent = field.unit ?? '';
  }

  const boundsFor = (side: SpacingSide): { minimum: number; maximum: number | undefined } => {
    const sideSchema = schema?.kind === 'object' ? schema.properties[side] : undefined;
    return {
      minimum: field.min ?? (sideSchema?.kind === 'number' ? sideSchema.minimum : undefined) ?? 0,
      maximum: field.max ?? (sideSchema?.kind === 'number' ? sideSchema.maximum : undefined),
    };
  };

  const writeCarrier = (): void => {
    carrier.value = JSON.stringify(values);
  };
  const commit = (): void => {
    writeCarrier();
    carrier.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };

  const createSideInput = (
    side: SpacingSide,
    options: { readonly key: string; readonly ariaLabel: string; readonly linked: boolean },
  ): HTMLInputElement => {
    const bounds = boundsFor(side);
    const input = createDesignerInput(ownerDocument, {
      appearance: 'number',
      ariaLabel: options.ariaLabel,
      value: String(values[side]),
      min: bounds.minimum,
      ...(bounds.maximum === undefined ? {} : { max: bounds.maximum }),
      ...(field.step === undefined ? {} : { step: field.step }),
    });
    input.className += ' designer-spacing-input';
    // 面板提交后整栏重建；唯一稳定键让焦点回到刚编辑的那条边，而不是第一条。
    input.dataset.inspectorSearchKey = `descriptor-field-${field.id}-${options.key}`;
    input.addEventListener('input', () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) return;
      if (options.linked) values = { top: parsed, right: parsed, bottom: parsed, left: parsed };
      else values[side] = parsed;
      writeCarrier();
    });
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      const next = Math.min(
        Math.max(Number.isFinite(parsed) ? parsed : 0, bounds.minimum),
        bounds.maximum ?? Infinity,
      );
      if (options.linked) values = { top: next, right: next, bottom: next, left: next };
      else values[side] = next;
      input.value = String(next);
      commit();
    });
    return input;
  };

  const renderSplit = (): void => {
    for (const side of SPACING_SIDES) {
      const copy = DESIGNER_UI_TEXT.descriptor.spacingSides[side];
      const cell = ownerDocument.createElement('label');
      cell.className = `designer-spacing-cell designer-spacing-cell-${side}`;
      const direction = ownerDocument.createElement('span');
      direction.className = 'designer-spacing-dir';
      direction.setAttribute('aria-hidden', 'true');
      direction.textContent = copy.short;
      cell.append(
        direction,
        createSideInput(side, { key: side, ariaLabel: copy.label, linked: false }),
      );
      shell.appendChild(cell);
    }
  };

  const renderLinked = (): void => {
    const copy = DESIGNER_UI_TEXT.descriptor;
    const cell = ownerDocument.createElement('label');
    cell.className = 'designer-spacing-cell designer-spacing-cell-all';
    const direction = ownerDocument.createElement('span');
    direction.className = 'designer-spacing-dir';
    direction.setAttribute('aria-hidden', 'true');
    direction.textContent = copy.spacingAllSides;
    cell.append(
      direction,
      createSideInput('top', {
        key: 'all',
        ariaLabel: `${field.label} ${copy.spacingAllSides}`,
        linked: true,
      }),
    );
    shell.appendChild(cell);
  };

  const render = (): void => {
    shell.dataset.spacingMode = linked ? 'linked' : 'split';
    toggle.setAttribute('aria-pressed', String(linked));
    toggle.setAttribute(
      'aria-label',
      linked ? DESIGNER_UI_TEXT.descriptor.spacingUnlink : DESIGNER_UI_TEXT.descriptor.spacingLink,
    );
    toggle.dataset.tip = linked
      ? DESIGNER_UI_TEXT.descriptor.spacingUnlink
      : DESIGNER_UI_TEXT.descriptor.spacingLinkHint;
    toggle.innerHTML = designerIcon(linked ? 'link' : 'unlink');
    shell.replaceChildren();
    if (linked) renderLinked();
    else renderSplit();
    writeCarrier();
  };

  toggle.addEventListener('click', () => {
    if (linked) {
      linked = false;
      rememberSpacingLinkState(fieldKey, false);
      render();
      return;
    }
    const top = values.top;
    values = { top, right: top, bottom: top, left: top };
    linked = true;
    rememberSpacingLinkState(fieldKey, true);
    render();
    commit();
  });

  scope.append(frame, ...(unit === undefined ? [] : [unit]), carrier);
  render();
  return { element: scope, valueTarget: carrier, labelAction: toggle };
}

export function descriptorFieldSchema(
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): BaseScreenMaterialPropSchema | undefined {
  const target = field.target === 'interaction' ? (field.projection ?? 'props') : field.target;
  const schema =
    target === 'props'
      ? context.manifest.propsSchema
      : target === 'style'
        ? context.manifest.styleSchema
        : undefined;
  return schema === undefined ? undefined : resolveSchema(field.path, schema);
}

export function applyFieldDataset(
  control: HTMLElement,
  field: BaseScreenMaterialEditorField,
): void {
  control.dataset.descriptorFieldId = field.id;
  control.dataset.descriptorTarget = field.target;
  control.dataset.descriptorPath = JSON.stringify(field.path);
  control.dataset.descriptorControl = field.control;
  if (field.projection !== undefined) control.dataset.descriptorProjection = field.projection;
}
