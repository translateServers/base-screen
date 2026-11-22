import type { ScreenComponentNode, ScreenDocument, ScreenJsonValue } from '@base-screen/contracts';
import { MAX_STYLE_RULES_PER_COMPONENT } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type {
  BaseScreenHostConditionalStyleAuthoringPort,
  BaseScreenHostConditionalStyleBinding,
  BaseScreenHostConditionalStyleSource,
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenMaterialPropSchema,
  BaseScreenPluginInspectorControlCatalog,
} from '@base-screen/plugin-core';
import { BASE_SCREEN_RESERVED_STYLE_SCHEMAS } from '@base-screen/plugin-core';
import {
  designerHostStyleFields,
  withHostConditionalStyleBinding,
  withoutHostConditionalStyleBinding,
} from '../../../common/operations/style/designer-host-conditional-style.js';
import {
  type DesignerInspectorContext,
  getDesignerInspectorContext,
} from '../../../common/operations/style/designer-inspector.js';
import {
  DESIGNER_STYLE_RULE_OPERATORS,
  formatDesignerStyleRuleValue,
} from '../../../common/operations/style/designer-style-rules.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  createDesignerColorPalette,
  readDesignerColorPaletteValue,
} from '../color/designer-color-palette-dom.js';
import type { DesignerDescriptorDatasetFields } from '../descriptor/designer-descriptor-dom.js';
import { renderDesignerDescriptorZone } from '../descriptor/designer-descriptor-dom.js';
import {
  appendDesignerRangeField,
  createDesignerFieldElement,
  createDesignerFieldRow,
} from '../designer-field-primitives.js';
import { appendDesignerQuickStyle } from '../designer-quick-style-dom.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  appendDesignerFieldMessage,
  createDesignerButton,
  createDesignerInput,
  createDesignerSelect,
} from '../designer-ui-primitives.js';
import { appendCanvasControls } from './designer-canvas-properties-dom.js';
import { createDesignerCanvasPresentationSettings } from './designer-canvas-transactions.js';
import {
  appendDesignerColorGroup,
  segmentDesignerColorFields,
  shouldGroupColorFields,
} from './designer-color-group-dom.js';
import { appendMultiSelectionControls } from './designer-multi-selection-dom.js';
import {
  appendActionButton,
  appendFieldGrid,
  appendInput,
  appendListItem,
  appendPropControl,
  appendPropertySwitch,
  appendSection,
  appendStyleControl,
} from './designer-panel-primitives.js';

export function renderDesignerProperties(
  properties: HTMLElement,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
  hostResourceSelectionButtonVisible = false,
  canvasPresentation = createDesignerCanvasPresentationSettings(),
  inspectorControls?: BaseScreenPluginInspectorControlCatalog | undefined,
  hostConditionalStyleAuthoring?: BaseScreenHostConditionalStyleAuthoringPort,
  refreshConditionalStyles?: (componentIds: readonly string[]) => void,
): void {
  properties.replaceChildren();
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind === 'canvas') {
    if (document !== undefined) {
      appendCanvasControls(
        properties,
        document,
        hostResourceSelectionButtonVisible,
        canvasPresentation,
      );
    }
    return;
  }
  if (context.kind === 'multi-selection') {
    appendMultiSelectionControls(properties, context, document, interaction, catalog);
    return;
  }
  if (context.kind === 'single-group') {
    appendGroupOverview(properties, context);
  }
  const locked =
    document !== undefined && isScreenComponentEffectivelyLocked(document, context.component.id);
  if (locked) appendLockedInspectorNotice(properties);
  appendComponentControls(
    properties,
    context,
    document,
    interaction,
    catalog,
    getDatasetFields,
    inspectorControls,
    hostConditionalStyleAuthoring,
    refreshConditionalStyles,
  );
  if (locked) disableLockedComponentControls(properties);
}

/** 组件是否越出画布：粘贴、跨画布改尺寸、拖到边缘外都会留下界外内容，预览时会被裁掉。 */
function isOutOfCanvas(
  document: ScreenDocument | undefined,
  component: ScreenComponentNode,
): boolean {
  if (document === undefined) return false;
  const { width, height } = document.canvas;
  const { x, y } = component.position;
  const { width: componentWidth, height: componentHeight } = component.size;
  return x < 0 || y < 0 || x + componentWidth > width || y + componentHeight > height;
}

function appendLockedInspectorNotice(properties: HTMLElement): void {
  const notice = properties.ownerDocument.createElement('p');
  notice.className = 'designer-inspector-lock-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = DESIGNER_UI_TEXT.propertiesPanel.lockedEditingHint;
  properties.appendChild(notice);
}

function disableLockedComponentControls(properties: HTMLElement): void {
  for (const control of properties.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
  >('input, select, textarea, button')) {
    const property = control.dataset.property;
    if (property === 'locked' || property === 'hidden') continue;
    control.disabled = true;
    if (!control.hasAttribute('data-tip')) {
      control.setAttribute('data-tip', DESIGNER_UI_TEXT.propertiesPanel.lockedEditingHint);
    }
  }
}

interface RenderableInspectorField<T> {
  readonly control: string;
  readonly field: T;
  readonly schema: BaseScreenMaterialPropSchema;
}

/**
 * 分区内按「连续色值」分段：一段 ≥ 3 个色值时合成色板组，其余字段原样落行。
 * 只认相邻关系——被字号、开关这类字段打断就不跨段拼板，避免把不相关的颜色凑成一套配色。
 */
function appendInspectorFields<T>(
  parent: HTMLElement,
  fields: readonly RenderableInspectorField<T>[],
  options: {
    readonly groupKey: string;
    readonly keyOf: (field: T) => string;
    readonly labelOf: (field: T) => string;
    readonly valueOf: (field: T) => ScreenJsonValue | undefined;
    readonly renderField: (parent: HTMLElement, field: RenderableInspectorField<T>) => void;
  },
): void {
  for (const segment of segmentDesignerColorFields(fields)) {
    if (segment.color && shouldGroupColorFields(segment.fields.length)) {
      appendDesignerColorGroup(parent, {
        groupKey: options.groupKey,
        entries: segment.fields.map((item) => ({
          key: options.keyOf(item.field),
          label: options.labelOf(item.field),
          value: options.valueOf(item.field),
        })),
        renderField: (container, entry) => {
          const item = segment.fields.find(
            (candidate) => options.keyOf(candidate.field) === entry.key,
          );
          if (item !== undefined) options.renderField(container, item);
        },
      });
      continue;
    }
    for (const item of segment.fields) options.renderField(parent, item);
  }
}

function appendComponentControls(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'single-material' | 'single-group' }>,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
  inspectorControls?: BaseScreenPluginInspectorControlCatalog | undefined,
  hostConditionalStyleAuthoring?: BaseScreenHostConditionalStyleAuthoringPort,
  refreshConditionalStyles?: (componentIds: readonly string[]) => void,
): void {
  const { component, manifest } = context;
  const geometry = appendSection(
    properties,
    DESIGNER_UI_TEXT.propertiesPanel.geometry,
    false,
    undefined,
    'geometry',
  );
  geometry.className += ' designer-inspector-geometry-section';
  const geometryGrid = appendFieldGrid(geometry);
  geometryGrid.className += ' designer-inspector-geometry-grid';
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.x,
    'x',
    component.position.x,
    'number',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.y,
    'y',
    component.position.y,
    'number',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.rotation,
    'rotation',
    component.rotation,
    'number',
    '-180',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.width,
    'width',
    component.size.width,
    'number',
    '1',
  );
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.height,
    'height',
    component.size.height,
    'number',
    '1',
  );
  if (manifest !== undefined) appendFlipActions(geometryGrid, component, manifest);
  const zIndex = appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.zIndex,
    'zIndex',
    component.zIndex,
    'number',
    '0',
  );
  zIndex.dataset.inspectorAdvanced = 'true';
  if (context.kind === 'single-material' && component.type === 'base.image') {
    appendImageDensityActions(geometryGrid, component.id);
  }
  // 越界提示挂在几何段末尾而不是逐字段：几何是三列网格，字段内插提示会把整行挤歪。
  if (isOutOfCanvas(document, component)) {
    const hint = geometry.ownerDocument.createElement('p');
    hint.className = 'designer-field-hint';
    hint.dataset.inspectorIssue = 'out-of-canvas';
    hint.textContent = DESIGNER_UI_TEXT.propertiesPanel.outOfCanvas;
    geometry.appendChild(hint);
  }
  // 状态段曾经带 advanced 标记：基础密度下整段 hidden，锁定/隐藏开关直接消失，
  // 用户只能切到「全部」才找得到。它是常用开关而不是高级项 —— 改为可见但默认收起。
  const status = appendSection(
    properties,
    DESIGNER_UI_TEXT.propertiesPanel.status,
    false,
    false,
    'status',
  );
  // 状态用胶囊开关，与「行为」段的 boolean 控件同一套语汇；方形 checkbox 留给真正的多选。
  appendPropertySwitch(
    status,
    DESIGNER_UI_TEXT.propertiesPanel.locked,
    'locked',
    component.status.locked,
  );
  appendPropertySwitch(
    status,
    DESIGNER_UI_TEXT.propertiesPanel.hidden,
    'hidden',
    component.status.hidden,
  );
  if (context.kind === 'single-group') {
    appendGroupActions(properties, context);
  }
  if (manifest === undefined) return;
  appendCommonOpacityControl(properties, component, manifest);
  appendUniversalStyleSections(properties, component);
  appendDesignerQuickStyle(properties, manifest, { components: [component] });

  const descriptorAppearance = manifest.editorDescriptor?.appearance;
  if (descriptorAppearance !== undefined && descriptorAppearance.length > 0) {
    renderDesignerDescriptorZone(properties, descriptorAppearance, {
      document,
      interaction,
      catalog,
      getDatasetFields,
      inspectorControls,
    });
    return;
  }
  const content =
    manifest.propertyPanel.length === 0
      ? undefined
      : appendSection(
          properties,
          DESIGNER_UI_TEXT.propertiesPanel.content,
          false,
          undefined,
          'content',
        );
  const propFields: RenderableInspectorField<
    BaseScreenMaterialManifest['propertyPanel'][number]
  >[] = [];
  for (const field of manifest.propertyPanel) {
    const schema = manifest.propsSchema.properties[field.prop];
    if (schema !== undefined) propFields.push({ control: field.control, field, schema });
  }
  if (content !== undefined) {
    appendInspectorFields(content, propFields, {
      groupKey: `${component.id}:prop`,
      keyOf: (field) => field.prop,
      labelOf: (field) => field.label,
      valueOf: (field) => component.props[field.prop],
      renderField: (host, item) =>
        appendPropControl(
          host,
          item.field.label,
          item.field.prop,
          component.props[item.field.prop],
          item.schema,
          item.field.control,
          `${component.id}:prop:${item.field.prop}`,
          item.field.allowGradient === true,
        ),
    });
  }
  const stylePanel = manifest.stylePanel ?? [];
  const style =
    stylePanel.length === 0
      ? undefined
      : appendSection(
          properties,
          DESIGNER_UI_TEXT.propertiesPanel.style,
          false,
          undefined,
          'style',
        );
  const styleFields: RenderableInspectorField<
    NonNullable<BaseScreenMaterialManifest['stylePanel']>[number]
  >[] = [];
  for (const field of stylePanel) {
    if (field.style === 'opacity') continue;
    const schema = manifest.styleSchema.properties[field.style];
    if (schema !== undefined) styleFields.push({ control: field.control, field, schema });
  }
  if (style !== undefined) {
    appendInspectorFields(style, styleFields, {
      groupKey: `${component.id}:style`,
      keyOf: (field) => field.style,
      labelOf: (field) => field.label,
      valueOf: (field) => component.style[field.style],
      renderField: (host, item) =>
        appendStyleControl(
          host,
          item.field.label,
          item.field.style,
          component.style[item.field.style],
          item.schema,
          item.field.control,
          `${component.id}:style:${item.field.style}`,
          item.field.allowGradient === true,
        ),
    });
  }
  appendConditionalStyleSection(properties, component, manifest);
  if (
    context.kind === 'single-material' &&
    hostConditionalStyleAuthoring !== undefined &&
    hostConditionalStyleAuthoring.sources.length > 0
  ) {
    appendHostConditionalStyleSection(
      properties,
      component,
      manifest,
      hostConditionalStyleAuthoring,
      refreshConditionalStyles,
    );
  }
}

/** 条件样式：规则按组件 dataState.value 判定，命中后覆盖一个颜色字段。 */
function appendConditionalStyleSection(
  properties: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
): void {
  const colorKeys = (manifest.stylePanel ?? [])
    .filter(
      (field) =>
        field.control === 'color' &&
        manifest.styleSchema.properties[field.style]?.kind === 'string',
    )
    .map((field) => field.style);
  if (colorKeys.length === 0) return;
  const rules = component.styleRules ?? [];
  const section = appendSection(
    properties,
    DESIGNER_UI_TEXT.propertiesPanel.conditionalStyle,
    false,
    undefined,
    'conditional-style',
  );
  section.className += ' designer-conditional-style-section';
  section.dataset.styleRuleComponent = component.id;
  const hint = section.ownerDocument.createElement('p');
  hint.className = 'designer-style-rule-hint';
  hint.textContent = DESIGNER_UI_TEXT.propertiesPanel.conditionalStyleHint;
  section.appendChild(hint);
  const list = section.ownerDocument.createElement('div');
  list.className = 'designer-style-rules';
  section.appendChild(list);
  if (rules.length === 0) {
    const empty = section.ownerDocument.createElement('p');
    empty.className = 'designer-style-rule-empty';
    empty.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleEmpty;
    list.appendChild(empty);
  }
  rules.forEach((rule, index) => {
    const row = section.ownerDocument.createElement('div');
    row.className = 'designer-style-rule';
    row.dataset.styleRuleId = rule.id;
    row.dataset.styleRuleComponent = component.id;
    const header = section.ownerDocument.createElement('div');
    header.className = 'designer-style-rule-header';
    const title = section.ownerDocument.createElement('strong');
    title.textContent = `${DESIGNER_UI_TEXT.propertiesPanel.styleRule} ${index + 1}`;
    const actions = section.ownerDocument.createElement('span');
    actions.className = 'designer-style-rule-actions';
    actions.appendChild(
      styleRuleActionButton(
        section.ownerDocument,
        'up',
        DESIGNER_UI_TEXT.propertiesPanel.styleRuleMoveUp,
        index === 0,
      ),
    );
    actions.appendChild(
      styleRuleActionButton(
        section.ownerDocument,
        'down',
        DESIGNER_UI_TEXT.propertiesPanel.styleRuleMoveDown,
        index === rules.length - 1,
      ),
    );
    actions.appendChild(
      styleRuleActionButton(
        section.ownerDocument,
        'remove',
        DESIGNER_UI_TEXT.propertiesPanel.styleRuleRemove,
        false,
      ),
    );
    header.appendChild(title);
    header.appendChild(actions);
    row.appendChild(header);

    const fields = section.ownerDocument.createElement('div');
    fields.className = 'designer-style-rule-fields';
    const pathRow = createDesignerFieldRow(section.ownerDocument, {
      label: DESIGNER_UI_TEXT.propertiesPanel.styleRulePath,
    });
    const path = createDesignerInput(section.ownerDocument, {
      value: rule.when.path.join('.'),
      placeholder: DESIGNER_UI_TEXT.propertiesPanel.styleRulePathPlaceholder,
      ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.styleRulePath,
    });
    path.dataset.styleRulePath = '';
    pathRow.control.appendChild(path);
    fields.appendChild(pathRow.field);

    const operatorRow = createDesignerFieldRow(section.ownerDocument, {
      label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleOperator,
    });
    const operator = createDesignerSelect(section.ownerDocument, {
      options: DESIGNER_STYLE_RULE_OPERATORS.map((value) => ({
        value,
        label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleOperators[value],
        selected: value === rule.when.operator,
      })),
    });
    operator.dataset.styleRuleOperator = '';
    operatorRow.control.appendChild(enhanceDesignerSelect(operator).element);
    fields.appendChild(operatorRow.field);

    const valueRow = createDesignerFieldRow(section.ownerDocument, {
      label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleValue,
    });
    const value = createDesignerInput(section.ownerDocument, {
      value: formatDesignerStyleRuleValue(rule.when.value),
      ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.styleRuleValue,
      disabled: rule.when.operator === 'exists',
    });
    value.dataset.styleRuleValue = '';
    valueRow.control.appendChild(value);
    fields.appendChild(valueRow.field);

    const activeKey =
      Object.keys(rule.style).find((key) => colorKeys.includes(key)) ?? colorKeys[0]!;
    if (colorKeys.length > 1) {
      const keyRow = createDesignerFieldRow(section.ownerDocument, {
        label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleKey,
      });
      const key = createDesignerSelect(section.ownerDocument, {
        options: colorKeys.map((keyName) => ({
          value: keyName,
          label: keyName,
          selected: keyName === activeKey,
        })),
      });
      key.dataset.styleRuleStyleKey = '';
      keyRow.control.appendChild(enhanceDesignerSelect(key).element);
      fields.appendChild(keyRow.field);
    }

    const colorRow = createDesignerFieldRow(section.ownerDocument, {
      label: DESIGNER_UI_TEXT.propertiesPanel.styleRuleColor,
      tagName: 'span',
      stacked: true,
    });
    const color = rule.style[activeKey];
    const palette = createDesignerColorPalette(
      section.ownerDocument,
      typeof color === 'string' ? color : undefined,
      `style-rule:${component.id}:${rule.id}`,
      { allowGradient: false },
    );
    for (const control of palette.controls) control.dataset.styleRuleColor = '';
    colorRow.control.appendChild(palette.element);
    fields.appendChild(colorRow.field);

    row.appendChild(fields);
    list.appendChild(row);
  });
  const add = createDesignerButton(section.ownerDocument, {
    text: DESIGNER_UI_TEXT.propertiesPanel.styleRuleAdd,
    className: 'designer-style-rule-add',
    disabled: rules.length >= MAX_STYLE_RULES_PER_COMPONENT,
  });
  add.dataset.styleRuleAction = 'add';
  section.appendChild(add);
  if (rules.length >= MAX_STYLE_RULES_PER_COMPONENT) {
    const limit = section.ownerDocument.createElement('p');
    limit.className = 'designer-style-rule-hint';
    limit.textContent = DESIGNER_UI_TEXT.propertiesPanel.styleRuleLimit(
      MAX_STYLE_RULES_PER_COMPONENT,
    );
    section.appendChild(limit);
  }
}

/**
 * 宿主条件样式：条件源与语义归宿主，Engine 只渲染原生表单并驱动保存。
 *
 * 保存成功后宿主必须让新绑定对 `conditionalStylePort` 生效；Engine 随后重算该组件，
 * 保证「改完即见」而不需要刷新整张画布。列表与表单的状态只存在于作者面，不写文档。
 */
function appendHostConditionalStyleSection(
  properties: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
  authoring: BaseScreenHostConditionalStyleAuthoringPort,
  refreshConditionalStyles?: (componentIds: readonly string[]) => void,
): void {
  const fields = designerHostStyleFields(manifest);
  if (fields.length === 0) return;
  const doc = properties.ownerDocument;
  const section = appendSection(
    properties,
    DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyle,
    false,
    undefined,
    'host-conditional-style',
  );
  section.className += ' designer-host-conditional-style-section';
  section.dataset.hostStyleComponent = component.id;

  const hint = doc.createElement('p');
  hint.className = 'designer-style-rule-hint';
  hint.textContent = DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleHint;
  section.appendChild(hint);

  const list = doc.createElement('div');
  list.className = 'designer-style-rules';
  list.dataset.hostStyleRows = '';
  section.appendChild(list);

  const form = doc.createElement('div');
  form.className = 'designer-style-rule-fields designer-host-style-form';
  section.appendChild(form);

  const status = doc.createElement('p');
  status.className = 'designer-host-style-status';
  status.dataset.hostStyleStatus = '';
  status.setAttribute('aria-live', 'polite');
  section.appendChild(status);

  let bindings: readonly BaseScreenHostConditionalStyleBinding[] = [];
  try {
    bindings = [...authoring.bindings(component.id)];
  } catch {
    // 宿主读取绑定失败不能拖垮整块检查器；表单仍可打开，保存时会再次报告失败。
    bindings = [];
  }
  let sourceId = authoring.sources[0]!.id;
  let conditionId = authoring.sources[0]!.conditions[0]?.id ?? '';
  let styleKey = fields[0]!.key;
  let pendingColor = readHostStyleString(component.style[styleKey]) ?? '#ffffff';
  let readValue = (): string => pendingColor;
  let saving = false;

  const sourceOf = (id: string): BaseScreenHostConditionalStyleSource | undefined =>
    authoring.sources.find((source) => source.id === id);
  const sourceLabel = (id: string): string => sourceOf(id)?.label ?? id;
  const conditionLabel = (id: string): string =>
    sourceOf(sourceId)?.conditions.find((condition) => condition.id === id)?.label ?? id;
  const boundStyleValue = (key: string): ScreenJsonValue | undefined =>
    bindings.find((binding) => binding.sourceId === sourceId && binding.conditionId === conditionId)
      ?.style[key];
  const initialStyleValue = (): ScreenJsonValue | undefined =>
    boundStyleValue(styleKey) ?? component.style[styleKey];

  const setButtonsDisabled = (disabled: boolean): void => {
    for (const button of section.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = disabled;
    }
  };

  const renderRows = (): void => {
    list.replaceChildren();
    const rows = bindings.flatMap((binding) =>
      Object.entries(binding.style).map(([key, value]) => ({ binding, key, value })),
    );
    if (rows.length === 0) {
      const empty = doc.createElement('p');
      empty.className = 'designer-style-rule-empty';
      empty.textContent = DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleEmpty;
      list.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const item = doc.createElement('div');
      item.className = 'designer-style-rule';
      const header = doc.createElement('div');
      header.className = 'designer-style-rule-header';
      const title = doc.createElement('strong');
      title.textContent = `${sourceLabel(row.binding.sourceId)} · ${conditionLabel(
        row.binding.conditionId,
      )}`;
      const remove = createDesignerButton(doc, {
        text: '×',
        ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleRemove,
        tip: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleRemove,
        variant: 'danger',
        className: 'designer-style-rule-action',
        disabled: saving,
      });
      remove.dataset.hostStyleRemove = '';
      remove.dataset.hostStyleSourceId = row.binding.sourceId;
      remove.dataset.hostStyleConditionId = row.binding.conditionId;
      remove.dataset.hostStyleKey = row.key;
      remove.addEventListener('click', () => {
        void commit(
          withoutHostConditionalStyleBinding(
            bindings,
            row.binding.sourceId,
            row.binding.conditionId,
            row.key,
          ),
        );
      });
      header.appendChild(title);
      header.appendChild(remove);
      const readout = doc.createElement('p');
      readout.className = 'designer-style-rule-hint';
      readout.textContent = `${row.key} = ${formatHostStyleValue(row.value)}`;
      item.appendChild(header);
      item.appendChild(readout);
      list.appendChild(item);
    }
  };

  const appendSelectRow = (label: string, select: HTMLSelectElement): void => {
    const row = createDesignerFieldRow(doc, { label });
    row.control.appendChild(enhanceDesignerSelect(select).element);
    form.appendChild(row.field);
  };

  const renderForm = (): void => {
    form.replaceChildren();
    const source = sourceOf(sourceId);
    const sourceSelect = createDesignerSelect(doc, {
      ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleSource,
      options: authoring.sources.map((item) => ({
        value: item.id,
        label: item.label,
        selected: item.id === sourceId,
      })),
    });
    sourceSelect.dataset.hostStyleSource = '';
    sourceSelect.addEventListener('change', () => {
      sourceId = sourceSelect.value;
      conditionId = sourceOf(sourceId)?.conditions[0]?.id ?? '';
      pendingColor = readHostStyleString(initialStyleValue()) ?? '#ffffff';
      renderForm();
    });
    appendSelectRow(DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleSource, sourceSelect);

    const conditionSelect = createDesignerSelect(doc, {
      ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleCondition,
      options: (source?.conditions ?? []).map((item) => ({
        value: item.id,
        label: item.label,
        selected: item.id === conditionId,
      })),
    });
    conditionSelect.dataset.hostStyleCondition = '';
    conditionSelect.addEventListener('change', () => {
      conditionId = conditionSelect.value;
      pendingColor = readHostStyleString(initialStyleValue()) ?? '#ffffff';
      renderForm();
    });
    appendSelectRow(
      DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleCondition,
      conditionSelect,
    );

    const fieldSelect = createDesignerSelect(doc, {
      ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleField,
      options: fields.map((item) => ({
        value: item.key,
        label: item.label,
        selected: item.key === styleKey,
      })),
    });
    fieldSelect.dataset.hostStyleField = '';
    fieldSelect.addEventListener('change', () => {
      styleKey = fieldSelect.value;
      pendingColor = readHostStyleString(initialStyleValue()) ?? '#ffffff';
      renderForm();
    });
    appendSelectRow(DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleField, fieldSelect);

    const valueRow = createDesignerFieldRow(doc, {
      label: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleValue,
      tagName: 'span',
      stacked: true,
    });
    const field = fields.find((item) => item.key === styleKey) ?? fields[0]!;
    if (field.control === 'color') {
      const palette = createDesignerColorPalette(
        doc,
        readHostStyleString(initialStyleValue()) ?? '#ffffff',
        `host-style:${component.id}:${styleKey}`,
        { allowGradient: false },
      );
      const onColorChange = (event: Event): void => {
        const value = readDesignerColorPaletteValue(event.target);
        if (value !== undefined) pendingColor = value;
      };
      palette.element.addEventListener('change', onColorChange);
      palette.element.addEventListener('input', onColorChange);
      readValue = () => pendingColor;
      valueRow.control.appendChild(palette.element);
    } else if (field.control === 'select' && field.values !== undefined) {
      const current: ScreenJsonValue | undefined = initialStyleValue();
      const select = createDesignerSelect(doc, {
        ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleValue,
        options: field.values.map((value) => ({
          value,
          label: value,
          selected: typeof current === 'string' && value === current,
        })),
      });
      select.dataset.hostStyleValue = '';
      readValue = () => select.value;
      valueRow.control.appendChild(enhanceDesignerSelect(select).element);
    } else {
      const current: ScreenJsonValue | undefined = initialStyleValue();
      const input = createDesignerInput(doc, {
        ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleValue,
        value: typeof current === 'string' ? current : '',
      });
      input.dataset.hostStyleValue = '';
      readValue = () => input.value;
      valueRow.control.appendChild(input);
    }
    form.appendChild(valueRow.field);

    const add = createDesignerButton(doc, {
      text: DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleAdd,
      className: 'designer-style-rule-add',
      disabled: saving,
    });
    add.dataset.hostStyleAdd = '';
    add.addEventListener('click', () => {
      if (saving) return;
      const value = readValue().trim();
      if (value === '') {
        status.textContent = DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleValueRequired;
        return;
      }
      void commit(
        withHostConditionalStyleBinding(bindings, sourceId, conditionId, styleKey, value),
      );
    });
    form.appendChild(add);
  };

  const commit = async (next: readonly BaseScreenHostConditionalStyleBinding[]): Promise<void> => {
    if (saving) return;
    saving = true;
    setButtonsDisabled(true);
    status.textContent = DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleSaving;
    try {
      const result = await authoring.save(component.id, next);
      if (!result.ok) {
        status.textContent =
          result.diagnostics[0]?.message ??
          DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleSaveFailed;
        return;
      }
      bindings = [...authoring.bindings(component.id)];
      renderRows();
      refreshConditionalStyles?.([component.id]);
      status.textContent = DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleSaved;
    } catch {
      status.textContent = DESIGNER_UI_TEXT.propertiesPanel.hostConditionalStyleSaveFailed;
    } finally {
      saving = false;
      setButtonsDisabled(false);
    }
  };

  renderRows();
  renderForm();
}

function readHostStyleString(value: ScreenJsonValue | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function formatHostStyleValue(value: ScreenJsonValue | undefined): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function styleRuleActionButton(
  ownerDocument: Document,
  action: 'up' | 'down' | 'remove',
  label: string,
  disabled: boolean,
): HTMLButtonElement {
  const button = createDesignerButton(ownerDocument, {
    text: action === 'remove' ? '×' : action === 'up' ? '↑' : '↓',
    ariaLabel: label,
    tip: label,
    variant: action === 'remove' ? 'danger' : 'ghost',
    className: 'designer-style-rule-action',
    disabled,
  });
  button.dataset.styleRuleAction = action;
  return button;
}

function appendImageDensityActions(parent: HTMLElement, componentId: string): void {
  const field = createDesignerFieldElement(parent.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.imageDensity,
    tagName: 'div',
    className: 'designer-image-density-field',
  });
  const actions = parent.ownerDocument.createElement('span');
  actions.className = 'designer-image-density-actions';
  for (const density of [1, 2, 3, 4] as const) {
    const title = DESIGNER_UI_TEXT.propertiesPanel.imageDensityAction(density);
    const button = createDesignerButton(parent.ownerDocument, {
      ariaLabel: title,
      className: 'designer-image-density-button',
      text: DESIGNER_UI_TEXT.propertiesPanel.imageDensityValue(density),
      tip: title,
    });
    button.dataset.imageDensityAction = String(density);
    button.dataset.imageDensityComponentId = componentId;
    actions.appendChild(button);
  }
  field.appendChild(actions);
  parent.appendChild(field);
}

/**
 * 行为 / 滤镜是引擎级保留键：不依赖物料申报，任何物料都有这两组作者面。
 * 滤镜默认折叠（高级分区）；行为只有三个开关——没有非默认值时收起，
 * 一旦用户开过其中任何一个就保持展开，避免「我开的穿透去哪了」。
 */
function appendUniversalStyleSections(
  properties: HTMLElement,
  component: ScreenComponentNode,
): void {
  const text = DESIGNER_UI_TEXT.propertiesPanel;
  const schemas = BASE_SCREEN_RESERVED_STYLE_SCHEMAS;
  const behaviorActive =
    component.style.passThrough === true ||
    component.style.hoverPointer === true ||
    component.style.clip === true;
  const behavior = appendSection(properties, text.behavior, false, behaviorActive, 'behavior');
  for (const [key, label] of [
    ['passThrough', text.passThrough],
    ['hoverPointer', text.hoverPointer],
    ['clip', text.clip],
  ] as const) {
    appendStyleControl(
      behavior,
      label,
      key,
      component.style[key],
      schemas[key]!,
      'boolean',
      `${component.id}:style:${key}`,
      false,
    );
  }
  const filter = appendSection(properties, text.filter, true, false, 'filter');
  appendStyleControl(
    filter,
    text.blend,
    'blend',
    component.style.blend,
    schemas.blend!,
    'select',
    `${component.id}:style:blend`,
    false,
  );
  for (const [key, label] of [
    ['filterBlur', text.filterBlur],
    ['filterBrightness', text.filterBrightness],
    ['filterContrast', text.filterContrast],
    ['filterSaturate', text.filterSaturate],
    ['filterHueRotate', text.filterHueRotate],
  ] as const) {
    appendStyleControl(
      filter,
      label,
      key,
      component.style[key],
      schemas[key]!,
      'number',
      `${component.id}:style:${key}`,
      false,
    );
  }
}

function appendCommonOpacityControl(
  properties: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
): void {
  // 不透明度是引擎级保留键（ADR-0099 §2.3）：Renderer 几何帧对所有物料统一写入，
  // 因此公共区也无条件提供入口。物料申报的 schema 只用于收窄取值，不决定是否显示；
  // 提交侧同样回落到保留 schema（designer-property-transactions）。
  const schema =
    manifest.styleSchema.properties.opacity ?? BASE_SCREEN_RESERVED_STYLE_SCHEMAS.opacity;
  if (schema?.kind !== 'number') return;
  const section = appendSection(
    properties,
    DESIGNER_UI_TEXT.propertiesPanel.commonStyle,
    false,
    undefined,
    'opacity',
  );
  section.className += ' designer-inspector-common-section';
  const { field, control } = createDesignerFieldRow(properties.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.opacity,
    tagName: 'span',
    className: 'designer-opacity-field',
  });
  // 面板读数统一按百分比（原型 .range-row 的 0–100），事务侧仍写 0–1 的 canonical 值。
  const percent = Math.round(Number(component.style.opacity ?? 1) * 100);
  const { range, number } = appendDesignerRangeField(control, {
    ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.opacity,
    min: 0,
    max: 100,
    step: 1,
    value: String(percent),
    numberClassName: 'designer-field-range-value',
    // 与画布不透明度同一条读数语言：都读作 100%，不再一个是 100、一个是 100%。
    numberSymbol: '%',
  });
  for (const target of [range, number]) {
    target.dataset.style = 'opacity';
    target.dataset.opacityPercent = 'true';
  }
  appendDesignerFieldMessage(field, number, 'style-opacity');
  section.appendChild(field);
}

function appendFlipActions(
  parent: HTMLElement,
  component: ScreenComponentNode,
  manifest: BaseScreenMaterialManifest,
): void {
  const supportsHorizontal = manifest.styleSchema.properties.flipX?.kind === 'boolean';
  const supportsVertical = manifest.styleSchema.properties.flipY?.kind === 'boolean';
  if (!supportsHorizontal && !supportsVertical) return;
  const field = createDesignerFieldElement(parent.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.flipHorizontal,
    tagName: 'div',
    className: 'designer-flip-field',
  });
  const actions = parent.ownerDocument.createElement('span');
  actions.className = 'designer-flip-actions';
  if (supportsHorizontal) {
    actions.appendChild(
      flipButton(
        parent.ownerDocument,
        DESIGNER_UI_TEXT.propertiesPanel.flipHorizontal,
        'flipX',
        component.style.flipX === true,
      ),
    );
  }
  if (supportsVertical) {
    const button = flipButton(
      parent.ownerDocument,
      DESIGNER_UI_TEXT.propertiesPanel.flipVertical,
      'flipY',
      component.style.flipY === true,
    );
    button.dataset.flipLabel = DESIGNER_UI_TEXT.propertiesPanel.flipVertical;
    actions.appendChild(button);
  }
  field.appendChild(actions);
  parent.appendChild(field);
}

function flipButton(
  ownerDocument: Document,
  label: string,
  property: 'flipX' | 'flipY',
  pressed: boolean,
): HTMLButtonElement {
  const button = createDesignerButton(ownerDocument, {
    ariaLabel: label,
    className: 'designer-flip-button',
    pressed,
    text: property === 'flipX' ? '↔' : '↕',
    tip: label,
  });
  button.dataset.geometryAction = property;
  button.dataset.flipLabel = label;
  return button;
}

function appendGroupOverview(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'single-group' }>,
): void {
  const section = appendSection(
    properties,
    DESIGNER_UI_TEXT.propertiesPanel.groupSummary,
    false,
    undefined,
    'group-summary',
  );
  const list = properties.ownerDocument.createElement('ul');
  list.className = 'designer-inspector-summary';
  appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.group);
  appendListItem(
    list,
    DESIGNER_UI_TEXT.propertiesPanel.childCount(context.summary.directChildCount),
  );
  appendListItem(
    list,
    DESIGNER_UI_TEXT.propertiesPanel.descendantCount(context.summary.descendantCount),
  );
  if (context.summary.hasLockedDescendant) {
    appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.containsLockedDescendant);
  }
  if (context.summary.hasHiddenDescendant) {
    appendListItem(list, DESIGNER_UI_TEXT.propertiesPanel.containsHiddenDescendant);
  }
  section.appendChild(list);
}

function appendGroupActions(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'single-group' }>,
): void {
  const section = appendSection(
    properties,
    DESIGNER_UI_TEXT.propertiesPanel.groupActions,
    false,
    undefined,
    'group-actions',
  );
  appendActionButton(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.actionUngroup,
    'ungroup',
    !context.summary.canUngroup,
    context.component.status.locked
      ? DESIGNER_UI_TEXT.propertiesPanel.actionUnavailableLocked
      : DESIGNER_UI_TEXT.propertiesPanel.actionUnavailableEmptyGroup,
  );
}
