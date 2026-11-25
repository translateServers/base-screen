import type {
  ScreenBlueprintCondition,
  ScreenBlueprintValueExpression,
  ScreenDocument,
} from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type {
  BaseScreenBlueprintCanvasEdge,
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasSelection,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  designerBlueprintEventFieldPaths,
  designerBlueprintSetVariableSource,
  designerBlueprintTriggerSupportsEventField,
} from '../../../common/operations/blueprint/designer-blueprint-value-sources.js';
import { readDesignerVariableViews } from '../../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../dom/designer-icons.js';
import { createDesignerFieldRow, createDesignerSwitchField } from '../designer-field-primitives.js';
import { escapeAttribute, escapeHtml } from './designer-blueprint-dom-helpers.js';

const TEXT = DESIGNER_UI_TEXT.blueprint;
const GRAPH = TEXT.graph;
const OPERATORS: readonly ScreenBlueprintCondition['operator'][] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'exists',
];
const TRANSITIONS = ['appear', 'fade', 'slide-up'] as const;
const ROLES = ['related', 'detail', 'group', 'drill-down'] as const;

/**
 * 右侧检查器「配置」页（ADR-0107 §2.6，外观沿用设计视图检查器）：
 * 名称 + id | 类型 在检查器头部；下方是标准折叠分区（`designer-inspector-section`）与
 * 标签列 + 控件列字段行（`designer-field`），不另造一套表单外观。
 * 单个节点 → 锚点信息 / 基础配置 / 节点配置 / 上下游连线；
 * 单条连线 → 锚点信息 / 连线配置 / 同源执行顺序；多选 → 数量摘要与批量启用 / 停用 / 删除。
 */
export function renderDesignerBlueprintConfiguration(
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  catalog?: BaseScreenMaterialCatalog,
): string {
  const total = selection.nodes.length + selection.edges.length;
  if (document === undefined || total === 0) {
    return `<div class="designer-empty"><span class="designer-empty-icon" aria-hidden="true">${designerIcon('sliders')}</span><p class="designer-empty-title">${TEXT.inspectorEmpty}</p><p class="designer-empty-hint">${TEXT.inspectorEmptyHint}</p></div>`;
  }
  if (total > 1) return multiSelection(selection);
  const nodeId = selection.nodes[0];
  if (nodeId !== undefined) {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    return node === undefined ? '' : nodeConfiguration(document, graph, node);
  }
  const edge = graph.edges.find((candidate) => candidate.id === selection.edges[0]);
  return edge === undefined ? '' : edgeConfiguration(document, graph, edge, catalog);
}

function multiSelection(selection: BaseScreenBlueprintCanvasSelection): string {
  const nodeActions =
    selection.nodes.length === 0
      ? ''
      : `<button type="button" class="designer-control designer-button" data-blueprint-nodes-enabled="true">${GRAPH.enableNodes}</button><button type="button" class="designer-control designer-button" data-blueprint-nodes-enabled="false">${GRAPH.disableNodes}</button>`;
  return `<div class="blueprint-config" data-blueprint-multi>
    ${section(
      'multi',
      TEXT.selectionOverview,
      `<p class="blueprint-config-summary">${escapeHtml(GRAPH.multiSelection(selection.nodes.length, selection.edges.length))}</p>
      <div class="blueprint-config-actions">${nodeActions}</div>`,
    )}
    ${deleteButton(GRAPH.menu.delete)}
  </div>`;
}

/** 标准折叠分区：结构与 `createDesignerSection` 一致，外观只来自 chrome 层。 */
function section(key: string, title: string, body: string, summary = ''): string {
  return `<details class="designer-panel-section designer-inspector-section designer-inspector-disclosure blueprint-config-section" data-inspector-search-key="blueprint-${key}" open><summary class="designer-panel-section-title designer-inspector-section-title designer-inspector-section-summary designer-panel-section-summary">${escapeHtml(title)}${summary === '' ? '' : `<span class="designer-inspector-section-meta">${escapeHtml(summary)}</span>`}<span class="designer-panel-section-disclosure designer-inspector-section-disclosure" aria-hidden="true">${designerIcon('chevron-down')}</span></summary><div class="blueprint-config-content">${body}</div></details>`;
}

/**
 * 字段行占位：模板里只写「标签 + 控件」，行骨架由 `hydrateDesignerBlueprintFieldRows`
 * 用 `createDesignerFieldRow` / `createDesignerSwitchField` 生成，外观与设计视图检查器同源。
 */
function field(label: string, control: string, variant: 'row' | 'expression' = 'row'): string {
  return `<div data-blueprint-field-row="${escapeAttribute(label)}" data-blueprint-field-variant="${variant}">${control}</div>`;
}

/** 只读事实行：同一字段行网格，值是文本而不是控件。 */
function fact(label: string, value: string, code = ''): string {
  return field(
    label,
    `<span class="blueprint-config-value">${value === '' ? '' : `<span>${escapeHtml(value)}</span>`}${code === '' ? '' : `<code>${escapeHtml(code)}</code>`}</span>`,
  );
}

/** 开关行占位：由 `createDesignerSwitchField` 生成，`attributes` 落到开关本身。 */
function switchField(label: string, checked: boolean, attributes: string): string {
  return `<span data-blueprint-field-switch="${escapeAttribute(label)}" data-checked="${String(checked)}" ${attributes}></span>`;
}

function deleteButton(label: string): string {
  return `<div class="blueprint-config-footer"><button type="button" class="designer-control designer-button blueprint-delete-button" data-variant="danger" data-blueprint-delete>${escapeHtml(label)}</button></div>`;
}

function emptyLine(text: string): string {
  return `<p class="blueprint-config-empty">${escapeHtml(text)}</p>`;
}

function nodeConfiguration(
  document: ScreenDocument,
  graph: BaseScreenBlueprintCanvasGraph,
  node: BaseScreenBlueprintCanvasNode,
): string {
  const ports = (list: BaseScreenBlueprintCanvasNode['inputs'], direction: 'in' | 'out') =>
    list
      .map(
        (port) =>
          `<li class="blueprint-anchor" data-direction="${direction}" data-connected="${String(port.connected)}" data-available="${String(port.available)}"><span class="designer-badge" data-tone="${direction === 'in' ? 'success' : 'accent'}">${direction === 'in' ? GRAPH.inputs : GRAPH.outputs}</span><span class="blueprint-anchor-label">${escapeHtml(port.label)}</span><code>${escapeHtml(port.id)}</code></li>`,
      )
      .join('');
  const anchorRows = `${ports(node.outputs, 'out')}${ports(node.inputs, 'in')}`;
  const anchors =
    anchorRows === ''
      ? emptyLine(GRAPH.noEdges)
      : `<ul class="blueprint-anchor-list">${anchorRows}</ul>`;
  const id = escapeAttribute(node.id);
  const basic = [
    node.renamable
      ? field(
          GRAPH.nodeName,
          `<input type="text" class="designer-control designer-input" data-blueprint-node-field="name" data-node-id="${id}" value="${escapeAttribute(node.name ?? '')}" placeholder="${escapeAttribute(GRAPH.nodeNamePlaceholder)}" maxlength="64">`,
        )
      : '',
    switchField(
      GRAPH.enabledState,
      node.enabled,
      `data-blueprint-node-field="enabled" data-node-id="${id}"`,
    ),
  ].join('');
  const config = nodeSpecificConfiguration(document, node);
  const edges = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const titles = new Map(graph.nodes.map((candidate) => [candidate.id, candidate.title]));
  const edgeList =
    edges.length === 0
      ? emptyLine(GRAPH.noEdges)
      : `<ul class="blueprint-config-edges">${edges
          .map((edge) => {
            const upstream = edge.target === node.id;
            const other = upstream ? edge.source : edge.target;
            return `<li><button type="button" class="blueprint-config-link" data-blueprint-select-edge="${escapeAttribute(edge.id)}" data-category="${edge.category}"><span class="designer-badge" data-tone="${upstream ? 'success' : 'accent'}">${upstream ? GRAPH.upstream : GRAPH.downstream}</span><span class="blueprint-config-link-copy"><strong>${escapeHtml(titles.get(other) ?? other)}</strong><small>${escapeHtml(edge.label)}</small></span><span class="blueprint-config-link-arrow" aria-hidden="true">${designerIcon('chevron-right')}</span></button></li>`;
          })
          .join('')}</ul>`;
  return `<div class="blueprint-config" data-blueprint-node-config="${id}" data-node-kind="${node.kind}">
    ${section('anchors', GRAPH.anchorInfo, anchors, String(node.inputs.length + node.outputs.length))}
    ${section('basic', GRAPH.basicConfig, basic)}
    ${config === '' ? '' : section('node', GRAPH.nodeConfig, config)}
    ${section('edges', GRAPH.edgeList, edgeList, String(edges.length))}
  </div>`;
}

function nodeSpecificConfiguration(
  document: ScreenDocument,
  node: BaseScreenBlueprintCanvasNode,
): string {
  const id = escapeAttribute(node.id);
  switch (node.kind) {
    case 'timer':
      return field(
        TEXT.timerInterval,
        `<input type="number" class="designer-control designer-input" min="1" max="86400" step="1" data-blueprint-node-field="interval" data-node-id="${id}" value="${node.intervalSeconds ?? 5}">`,
      );
    case 'condition': {
      const condition = node.condition;
      if (condition === undefined) return '';
      return [
        expressionEditor(
          document,
          'node',
          node.id,
          'left',
          GRAPH.conditionLeft,
          condition.left,
          true,
        ),
        field(
          TEXT.conditionOperatorLabel,
          `<select class="designer-control designer-select" data-blueprint-node-field="operator" data-node-id="${id}">${OPERATORS.map(
            (operator) =>
              `<option value="${operator}"${operator === condition.operator ? ' selected' : ''}>${escapeHtml(TEXT.conditionOperator(operator))}</option>`,
          ).join('')}</select>`,
        ),
        condition.operator === 'exists' || condition.right === undefined
          ? ''
          : expressionEditor(
              document,
              'node',
              node.id,
              'right',
              GRAPH.conditionRight,
              condition.right,
              true,
            ),
      ].join('');
    }
    case 'component':
      return fact(GRAPH.material, '', node.materialType ?? node.subtitle);
    case 'variable': {
      const view = readDesignerVariableViews(document).find((item) => item.id === node.variableId);
      return [
        fact(TEXT.variableId, '', node.variableId ?? ''),
        fact(
          GRAPH.initialValue,
          '',
          truncate(JSON.stringify(view?.initialValue ?? null) ?? 'null'),
        ),
      ].join('');
    }
    default:
      return emptyLine(node.subtitle);
  }
}

function edgeConfiguration(
  document: ScreenDocument,
  graph: BaseScreenBlueprintCanvasGraph,
  edge: BaseScreenBlueprintCanvasEdge,
  catalog: BaseScreenMaterialCatalog | undefined,
): string {
  const titles = new Map(graph.nodes.map((node) => [node.id, node]));
  const source = titles.get(edge.source);
  const target = titles.get(edge.target);
  const id = escapeAttribute(edge.id);
  const sourcePort = source?.outputs.find((port) => port.id === edge.sourcePort);
  const targetPort = target?.inputs.find((port) => port.id === edge.targetPort);
  const facts = [
    fact(
      GRAPH.source,
      `${source?.title ?? edge.source} · ${sourcePort?.label ?? edge.sourcePort}`,
      edge.sourcePort,
    ),
    fact(
      GRAPH.target,
      edge.kind === 'semantic'
        ? (target?.title ?? edge.target)
        : `${target?.title ?? edge.target} · ${targetPort?.label ?? edge.targetPort}`,
      edge.kind === 'semantic' ? '' : edge.targetPort,
    ),
  ].join('');
  const parts: string[] = [];
  if (edge.kind === 'semantic') {
    parts.push(
      field(
        GRAPH.role,
        `<select class="designer-control designer-select" data-blueprint-edge-field="role" data-edge-id="${id}">${ROLES.map(
          (role) =>
            `<option value="${role}"${role === edge.role ? ' selected' : ''}>${escapeHtml(TEXT.semanticRoles[role])}</option>`,
        ).join('')}</select>`,
      ),
      emptyLine(TEXT.semanticHint),
    );
  } else {
    const inputs = target?.inputs.filter((port) => port.available) ?? [];
    if (target?.kind === 'host' && edge.targetPort.startsWith('event:')) {
      parts.push(
        field(
          GRAPH.hostEventName,
          `<input type="text" class="designer-control designer-input" data-blueprint-edge-field="host-event" data-edge-id="${id}" value="${escapeAttribute(edge.targetPort.slice('event:'.length))}" maxlength="128">`,
        ),
      );
    } else if (inputs.length > 1) {
      parts.push(
        field(
          GRAPH.targetPort,
          `<select class="designer-control designer-select" data-blueprint-edge-field="target-port" data-edge-id="${id}">${inputs
            .map(
              (port) =>
                `<option value="${escapeAttribute(port.id)}"${port.id === edge.targetPort ? ' selected' : ''}>${escapeHtml(port.label)}</option>`,
            )
            .join('')}</select>`,
        ),
      );
    }
    const eventFields = designerBlueprintTriggerSupportsEventField(document, edge.id);
    if (edge.value !== undefined) {
      parts.push(
        expressionEditor(
          document,
          'edge',
          edge.id,
          'value',
          GRAPH.writeValue,
          edge.value,
          eventFields,
          catalog,
        ),
      );
    }
    // 从画布「打开 / 切换」的参数可选（ADR-0108 §2.5、ADR-0109）：先给开关，打开后才出现取值编辑器。
    if (
      target?.kind === 'sub-canvas' &&
      (edge.targetPort === 'open' || edge.targetPort === 'toggle')
    ) {
      parts.push(
        switchField(
          GRAPH.popupPayload,
          edge.payload !== undefined,
          `data-blueprint-edge-field="payload-enabled" data-edge-id="${id}"`,
        ),
      );
    }
    if (edge.payload !== undefined) {
      parts.push(
        expressionEditor(
          document,
          'edge',
          edge.id,
          'payload',
          target?.kind === 'sub-canvas' ? GRAPH.popupPayloadValue : GRAPH.payload,
          edge.payload,
          eventFields,
          catalog,
        ),
      );
    }
    // 「设置状态」的目标状态（ADR-0110 §2.4）：只能选目标组件已声明的状态。
    if (target?.kind === 'component' && edge.targetPort === 'set-state') {
      const items =
        document.components.find((component) => component.id === target.componentId)?.states
          ?.items ?? [];
      parts.push(
        field(
          GRAPH.targetState,
          `<select class="designer-control designer-select" data-blueprint-edge-field="state" data-edge-id="${id}">${items
            .map(
              (item) =>
                `<option value="${escapeAttribute(item.id)}"${item.id === edge.stateId ? ' selected' : ''}>${escapeHtml(item.name)}</option>`,
            )
            .join('')}</select>`,
        ),
      );
    }
    if (target?.kind === 'component' && ['show', 'hide', 'toggle'].includes(edge.targetPort)) {
      const transition = edge.transition;
      parts.push(
        field(
          GRAPH.transition,
          `<select class="designer-control designer-select" data-blueprint-edge-field="transition-effect" data-edge-id="${id}">
            <option value=""${transition === undefined ? ' selected' : ''}>${GRAPH.noTransition}</option>
            ${TRANSITIONS.map((effect) => `<option value="${effect}"${transition?.effect === effect ? ' selected' : ''}>${escapeHtml(GRAPH.transitionEffects[effect])}</option>`).join('')}
          </select>`,
        ),
        transition === undefined
          ? ''
          : field(
              GRAPH.durationMs,
              `<input type="number" class="designer-control designer-input" min="0" max="10000" step="50" data-blueprint-edge-field="transition-duration" data-edge-id="${id}" value="${transition.durationMs}">`,
            ),
      );
    }
    if (edge.order !== undefined && (edge.siblingCount ?? 1) > 1) {
      parts.push(
        field(
          GRAPH.executionOrder,
          `<span class="blueprint-config-order"><span>${escapeHtml(GRAPH.edgeOrder(edge.order, edge.siblingCount ?? 1))}</span><button type="button" class="designer-control designer-icon-button" data-blueprint-edge-order="earlier" data-edge-id="${id}" data-tip="${escapeAttribute(GRAPH.earlier)}" aria-label="${escapeAttribute(GRAPH.earlier)}"${edge.order <= 1 ? ' disabled' : ''}>${designerIcon('arrow-up')}</button><button type="button" class="designer-control designer-icon-button" data-blueprint-edge-order="later" data-edge-id="${id}" data-tip="${escapeAttribute(GRAPH.later)}" aria-label="${escapeAttribute(GRAPH.later)}"${edge.order >= (edge.siblingCount ?? 1) ? ' disabled' : ''}>${designerIcon('arrow-down')}</button></span>`,
        ),
      );
    }
  }
  return `<div class="blueprint-config" data-blueprint-edge-config="${id}" data-category="${edge.category}">
    ${section('anchors', GRAPH.anchorInfo, facts)}
    ${parts.length === 0 ? '' : section('edge', GRAPH.edgeConfig, parts.join(''))}
    ${deleteButton(GRAPH.menu.deleteEdge)}
  </div>`;
}

/**
 * 取值表达式编辑器：来源（固定值 / 事件整体 / 事件字段 / 变量）+ 对应输入。
 * `owner` + `ownerId` + `slot` 定位写回位置：连线的 `value` / `payload`，条件节点的 `left` / `right`。
 */
function expressionEditor(
  document: ScreenDocument,
  owner: 'edge' | 'node',
  ownerId: string,
  slot: 'value' | 'payload' | 'left' | 'right',
  label: string,
  expression: ScreenBlueprintValueExpression,
  allowEventField: boolean,
  catalog?: BaseScreenMaterialCatalog,
): string {
  const source = designerBlueprintSetVariableSource(expression);
  const attrs = `data-blueprint-expression="${slot}" data-expression-owner="${owner}" data-expression-owner-id="${escapeAttribute(ownerId)}"`;
  const options = (
    [
      ['literal', TEXT.valueSources.literal],
      ['event', TEXT.valueSources.event],
      ['event-field', TEXT.valueSources.eventField],
      ['variable', TEXT.valueSources.variable],
      ...(source === 'advanced' ? [['advanced', TEXT.valueSources.advanced]] : []),
    ] as const
  )
    .filter(([value]) => value !== 'event-field' || allowEventField || source === 'event-field')
    .map(
      ([value, text]) =>
        `<option value="${value}"${value === source ? ' selected' : ''}${value === 'advanced' ? ' disabled' : ''}>${escapeHtml(text)}</option>`,
    )
    .join('');
  let editor = '';
  if (expression.kind === 'literal') {
    editor = `<input type="text" class="designer-control designer-input" data-expression-part="literal" value="${escapeAttribute(JSON.stringify(expression.value) ?? 'null')}" aria-label="${escapeAttribute(TEXT.literalJson)}">`;
  } else if (expression.kind === 'event-payload' && expression.path.length > 0) {
    const listId = `blueprint-fields-${owner}-${ownerId}-${slot}`.replace(/[^A-Za-z0-9_-]/g, '-');
    const fields =
      owner === 'edge' ? designerBlueprintEventFieldPaths(document, ownerId, catalog) : [];
    editor = `<input type="text" class="designer-control designer-input" data-expression-part="field" list="${listId}" value="${escapeAttribute(expression.path.join('.'))}" aria-label="${escapeAttribute(TEXT.eventField)}"><datalist id="${listId}">${fields.map((path) => `<option value="${escapeAttribute(path.join('.'))}"></option>`).join('')}</datalist>`;
  } else if (expression.kind === 'variable') {
    const variables = readDesignerVariableViews(document);
    editor = `<select class="designer-control designer-select" data-expression-part="variable" aria-label="${escapeAttribute(TEXT.sourceVariable)}">${variables
      .map(
        (variable) =>
          `<option value="${escapeAttribute(variable.id)}"${variable.id === expression.variableId ? ' selected' : ''}>${escapeHtml(variable.name)}</option>`,
      )
      .join('')}</select>`;
  } else if (source === 'advanced') {
    editor = `<code class="blueprint-config-advanced">${escapeHtml(truncate(JSON.stringify(expression) ?? ''))}</code>`;
  }
  return `<div class="blueprint-expression" ${attrs}>${field(
    label,
    `<span class="blueprint-expression-stack"><select class="designer-control designer-select" data-expression-part="source" aria-label="${escapeAttribute(TEXT.valueSource)}">${options}</select>${editor}</span>`,
    'expression',
  )}</div>`;
}

/**
 * 把配置页模板里的字段行占位换成标准字段行。必须在 `innerHTML` 之后、
 * `adoptDesignerFormControls` 之前调用（控件被移入控件列后再统一接管）。
 */
export function hydrateDesignerBlueprintFieldRows(root: ParentNode): void {
  // 纯字符串渲染的单测替身没有 DOM 查询能力：模板本身已可断言，跳过即可。
  if (typeof root.querySelectorAll !== 'function') return;
  const ownerDocument = (root as Node).ownerDocument ?? (root as Document);
  for (const placeholder of root.querySelectorAll<HTMLElement>('[data-blueprint-field-row]')) {
    const label = placeholder.dataset.blueprintFieldRow ?? '';
    const expression = placeholder.dataset.blueprintFieldVariant === 'expression';
    const interactive = placeholder.querySelector('input, select, textarea') !== null;
    const row = createDesignerFieldRow(ownerDocument, {
      label,
      // 多控件行与只读行不用 <label>：点击标签不该把焦点甩给其中某一个控件。
      tagName: interactive && !expression ? 'label' : 'div',
      className: expression
        ? 'blueprint-config-field blueprint-expression-row'
        : 'blueprint-config-field',
    });
    if (expression) {
      const text = ownerDocument.createElement('span');
      text.className = 'blueprint-expression-label';
      text.textContent = label;
      row.labelText.replaceChildren(text);
    }
    row.control.append(...placeholder.childNodes);
    placeholder.replaceWith(row.field);
  }
  for (const placeholder of root.querySelectorAll<HTMLElement>('[data-blueprint-field-switch]')) {
    const { field: row, input } = createDesignerSwitchField(ownerDocument, {
      label: placeholder.dataset.blueprintFieldSwitch ?? '',
      checked: placeholder.dataset.checked === 'true',
      className: 'blueprint-config-field',
    });
    for (const [key, value] of Object.entries(placeholder.dataset)) {
      if (key === 'blueprintFieldSwitch' || key === 'checked' || value === undefined) continue;
      input.dataset[key] = value;
    }
    placeholder.replaceWith(row);
  }
}

function truncate(value: string, limit = 96): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
