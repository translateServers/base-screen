import type { ScreenComponentNode, ScreenDocument, ScreenSubCanvas } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
  BaseScreenPluginInspectorControlCatalog,
} from '@base-screen/plugin-core';
import { BASE_SCREEN_RESERVED_STYLE_SCHEMAS } from '@base-screen/plugin-core';
import {
  DESIGNER_DEFAULT_STATE_ID,
  designerStateViewComponent,
} from '../../../common/operations/style/designer-component-states.js';
import {
  type DesignerInspectorContext,
  getDesignerInspectorContext,
} from '../../../common/operations/style/designer-inspector.js';
import { designerMaterialAppearance } from '../../../common/operations/style/designer-material-appearance.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDescriptorDatasetFields } from '../descriptor/designer-descriptor-dom.js';
import { renderDesignerDescriptorZone } from '../descriptor/designer-descriptor-dom.js';
import {
  appendDesignerRangeField,
  createDesignerFieldElement,
  createDesignerFieldRow,
} from '../designer-field-primitives.js';
import { appendDesignerQuickStyle } from '../designer-quick-style-dom.js';
import { appendDesignerFieldMessage, createDesignerButton } from '../designer-ui-primitives.js';
import { appendCanvasControls } from './designer-canvas-properties-dom.js';
import { createDesignerCanvasPresentationSettings } from './designer-canvas-transactions.js';
import {
  appendComponentJudgeSection,
  appendComponentStatesSection,
  type DesignerComponentStateContext,
  freezeDesignerStateSections,
  markDesignerStateOverrides,
} from './designer-component-states-dom.js';
import { appendMultiSelectionControls } from './designer-multi-selection-dom.js';
import {
  appendActionButton,
  appendFieldGrid,
  appendInput,
  appendListItem,
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
  stateContext?: DesignerComponentStateContext,
  artboardSubCanvas?: ScreenSubCanvas,
  startPageId?: string | null,
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
        artboardSubCanvas,
        startPageId,
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
    stateContext,
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

function appendComponentControls(
  properties: HTMLElement,
  context: Extract<DesignerInspectorContext, { readonly kind: 'single-material' | 'single-group' }>,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  getDatasetFields?: () => readonly DesignerDescriptorDatasetFields[],
  inspectorControls?: BaseScreenPluginInspectorControlCatalog | undefined,
  stateContext?: DesignerComponentStateContext,
): void {
  const { component, manifest } = context;
  // 组件状态（ADR-0110）：单个物料组件才有。编辑非默认状态时外观区读「基础 ⊕ 覆盖」的视图组件，
  // 位置尺寸与状态开关不随状态变化，整段只读。
  const stateful = context.kind === 'single-material' && manifest !== undefined;
  const editingStateId =
    stateful && stateContext !== undefined
      ? stateContext.editingStateId(component)
      : DESIGNER_DEFAULT_STATE_ID;
  const view = designerStateViewComponent(component, editingStateId);
  if (stateful && manifest !== undefined && stateContext !== undefined) {
    appendComponentStatesSection(properties, component, editingStateId, stateContext);
    if (component.states !== undefined && document !== undefined) {
      appendComponentJudgeSection(properties, component, document, stateContext);
    }
  }
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
  // 层级是几何的一部分，基础可见（ADR-0102 §7：「仅全量」只能整段标，不藏单个字段）。
  appendInput(
    geometryGrid,
    DESIGNER_UI_TEXT.propertiesPanel.zIndex,
    'zIndex',
    component.zIndex,
    'number',
    '0',
  );
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
  if (editingStateId !== DESIGNER_DEFAULT_STATE_ID) freezeDesignerStateSections(properties);
  if (manifest === undefined) return;
  appendCommonOpacityControl(properties, view, manifest);
  appendUniversalStyleSections(properties, view);
  appendDesignerQuickStyle(properties, manifest, { components: [view] });

  // 外观区只有一条渲染路径（ADR-0102 D1）：扁平面板先转换成描述符分区再渲染。
  renderDesignerDescriptorZone(
    properties,
    designerMaterialAppearance(manifest, DESIGNER_UI_TEXT.propertiesPanel),
    {
      document:
        document === undefined || view === component
          ? document
          : {
              ...document,
              components: document.components.map((item) => (item === component ? view : item)),
            },
      interaction,
      catalog,
      getDatasetFields,
      inspectorControls,
    },
  );
  if (editingStateId !== DESIGNER_DEFAULT_STATE_ID) {
    markDesignerStateOverrides(properties, component, editingStateId);
  }
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
  // 滤镜分量都是可选键：缺省即不施加该滤镜（Renderer 只拼声明过的分量）。「自动」时滑杆停在
  // 恒等值（模糊 0、亮度 / 对比度 / 饱和度 100%、色相 0°），已设置时可一键恢复自动。
  for (const [key, label, unit, autoValue] of [
    ['filterBlur', text.filterBlur, 'px', 0],
    ['filterBrightness', text.filterBrightness, '%', 100],
    ['filterContrast', text.filterContrast, '%', 100],
    ['filterSaturate', text.filterSaturate, '%', 100],
    ['filterHueRotate', text.filterHueRotate, '°', 0],
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
      { optional: true, unit, autoValue },
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
  // 翻转是引擎级保留键（ADR-0099 §2.3）：Renderer 几何帧对所有物料统一写入 transform，
  // 因此公共区无条件提供入口；物料申报的 schema 只用于收窄取值，不决定是否显示。
  const schemaOf = (key: 'flipX' | 'flipY') =>
    manifest.styleSchema.properties[key] ?? BASE_SCREEN_RESERVED_STYLE_SCHEMAS[key];
  const supportsHorizontal = schemaOf('flipX')?.kind === 'boolean';
  const supportsVertical = schemaOf('flipY')?.kind === 'boolean';
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
