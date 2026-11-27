import type { ScreenParseResult } from '@base-screen/contracts';
import {
  BASE_SCREEN_MATERIAL_EVENT,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  type BaseScreenMaterialTabularDataAdapter,
  type BaseScreenTableData,
  parseBaseScreenMaterialEditorDescriptor,
  parseBaseScreenTableData,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BoardMaterialElement, type BoardMaterialModel } from './board-element.js';
import {
  BOARD_DEFAULT_SURFACE,
  PLUGIN_BOARD_TABS_TAG_NAME,
  PLUGIN_BOARD_TABS_TYPE,
} from './identity.js';
import { readNumber, styleColor } from './json-values.js';
import { createBoardColumnsAdapter } from './tabular-columns-adapter.js';

/**
 * 标签页：一排可点选的标签，点击切换选中项并抛出 `tabChange { index, label, value }`。
 *
 * 只做「选中哪一项」这一件事（ADR-0099 T1）：标签切换后显示什么由文档层决定——
 * 蓝图里按 `value` 分支打开对应页面（ADR-0109 主从画布），或写变量驱动其他组件。
 * 因此它不内建内容区，也没有标题。
 *
 * 标签来自数据（第 1 列是标签文字，第 2 列是值，缺省取标签文字），不是 props：
 * 标签文字是读数而不是组件自身的说明文案（门禁 R2），也让标签可以由数据集或变量驱动。
 *
 * 选中项是组件自身的会话态：初始取 `activeIndex`，用户点击后保留；作者在检查器里改
 * `activeIndex` 时以新值为准。设计态（未开「事件」）不响应点击，避免与选中组件冲突。
 */
const PLUGIN_BOARD_TABS_EVENTS = ['tabChange'] as const;

/** 标签数上限：一排标签再多就该换下拉或分页了，渲染也不再保证可读。 */
export const TABS_MAX_ITEMS = 12;

const TABS_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    activeIndex: { kind: 'number', minimum: 0, maximum: TABS_MAX_ITEMS - 1 },
    gap: { kind: 'number', minimum: 0, maximum: 48 },
  },
  required: ['activeIndex'],
} satisfies BaseScreenMaterialObjectSchema;

const TABS_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    color: { kind: 'string' },
    accentColor: { kind: 'string' },
    borderColor: { kind: 'string' },
    borderRadius: { kind: 'number', minimum: 0, maximum: 24 },
    fontSize: { kind: 'number', minimum: 10, maximum: 40 },
  },
  required: ['backgroundColor', 'color', 'accentColor', 'fontSize'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_BOARD_TABS_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_TABS_TYPE,
  tagName: PLUGIN_BOARD_TABS_TAG_NAME,
  name: '标签页',
  category: '导航',
  keywords: ['标签', '页签', 'tab', '切换', '导航', '页面', '大屏'],
  defaultSize: { width: 420, height: 40 },
  defaultProps: { activeIndex: 0, gap: 8 },
  defaultData: {
    fields: [
      { id: 'label', label: '标签', valueType: 'string', nullable: false },
      { id: 'value', label: '值', valueType: 'string', nullable: false },
    ],
    rows: [
      { label: '总览', value: 'overview' },
      { label: '安防', value: 'security' },
      { label: '能耗', value: 'energy' },
    ],
  },
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { items: ['label', 'value'] } },
  },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: '#8aa4c0',
    accentColor: BOARD_DEFAULT_SURFACE.accentColor,
    borderColor: BOARD_DEFAULT_SURFACE.borderColor,
    borderRadius: 4,
    fontSize: 16,
  },
  // 新插入时选中色跟随文档主题主体色（ADR-0101）。
  themeStyle: { accentColor: 'primary' },
  styleSchema: TABS_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: TABS_PROPS_SCHEMA,
  propertyPanel: [],
  editorDescriptor: parseTabsEditorDescriptor(),
  events: [...PLUGIN_BOARD_TABS_EVENTS],
  dataCapabilities: ['static', 'dataset', 'variable', 'host-resource'],
  dataBinding: {
    roles: [{ id: 'items', minFields: 1, maxFields: 2, valueTypes: ['string', 'number'] }],
  },
  designCapabilities: { resize: true, rotate: false, children: false },
};

/** 检查器编排（ADR-0099 §2.4）：结构 → 文字 → 填充与描边。 */
function parseTabsEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      // 事件负载（ADR-0115 D3）：`value` 是选中标签的取值，可直接写进数据集参数。
      events: [
        {
          name: 'tabChange',
          label: '切换标签',
          payloadSchema: {
            kind: 'object',
            properties: {
              index: { kind: 'number' },
              label: { kind: 'string' },
              value: { kind: 'string' },
            },
            required: ['index', 'label', 'value'],
          },
        },
      ],
      appearance: [
        {
          id: 'structure',
          label: '结构',
          fields: [
            {
              id: 'activeIndex',
              target: 'props',
              path: ['activeIndex'],
              label: '默认选中',
              min: 0,
              max: TABS_MAX_ITEMS - 1,
              step: 1,
            },
            {
              id: 'gap',
              target: 'props',
              path: ['gap'],
              label: '标签间距',
              unit: 'px',
              min: 0,
              max: 48,
            },
          ],
        },
        {
          id: 'text',
          label: '文字',
          fields: [
            { id: 'color', target: 'style', path: ['color'], label: '文字色', control: 'color' },
            {
              id: 'accentColor',
              target: 'style',
              path: ['accentColor'],
              label: '选中色',
              control: 'color',
            },
            {
              id: 'fontSize',
              target: 'style',
              path: ['fontSize'],
              label: '字号',
              control: 'number',
            },
          ],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            {
              id: 'backgroundColor',
              target: 'style',
              path: ['backgroundColor'],
              label: '背景色',
              control: 'color',
              allowGradient: true,
            },
            {
              id: 'borderColor',
              target: 'style',
              path: ['borderColor'],
              label: '描边色',
              control: 'color',
            },
            {
              id: 'borderRadius',
              target: 'style',
              path: ['borderRadius'],
              label: '圆角',
              unit: 'px',
              min: 0,
              max: 24,
            },
          ],
        },
      ],
    },
    TABS_PROPS_SCHEMA,
    TABS_STYLE_SCHEMA,
    PLUGIN_BOARD_TABS_EVENTS,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials tabs editor descriptor is invalid.');
  }
  return parsed.value;
}

export interface BoardTabItem {
  readonly label: string;
  readonly value: string;
}

/**
 * 表格 → 标签：第 1 列是标签文字，第 2 列是值（缺省取标签文字）。空标签行跳过，
 * 超过 {@link TABS_MAX_ITEMS} 的部分截掉。纯函数，供渲染与测试共用。
 */
export function readBoardTabItems(data: BaseScreenTableData): readonly BoardTabItem[] {
  const [labelColumn, valueColumn] = data.columns;
  if (labelColumn === undefined) return [];
  const items: BoardTabItem[] = [];
  for (const row of data.rows) {
    const label = cellText(row[labelColumn.id]);
    if (label === '') continue;
    const value = valueColumn === undefined ? label : cellText(row[valueColumn.id]) || label;
    items.push({ label, value });
    if (items.length === TABS_MAX_ITEMS) break;
  }
  return items;
}

function cellText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export const PLUGIN_BOARD_TABS_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter =
  createBoardColumnsAdapter('items');

export class PluginBoardTabsElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_TABS_MANIFEST;

  #items: readonly BoardTabItem[] = [];
  #active = 0;
  /** 上次读到的 `activeIndex`：作者改了它才覆盖会话选中项。 */
  #authoredIndex: number | undefined;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    // 显隐归渲染器（组件隐藏、画板外组件、蓝图显隐都写 display:none），这里不能覆盖成 block。

    if (this.style.display !== 'none') this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.setAttribute('aria-label', PluginBoardTabsElement.manifest.name);

    const authored = Math.max(0, Math.round(readNumber(model.props.activeIndex, 0)));
    if (authored !== this.#authoredIndex) {
      this.#authoredIndex = authored;
      this.#active = authored;
    }

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    const parsed = parseBaseScreenTableData(model.dataState.value);
    if (!parsed.ok) {
      this.appendDataStatePlaceholder({
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: '标签数据格式无效',
      });
      return;
    }
    this.#items = readBoardTabItems(parsed.value);
    this.#paint(model);
  }

  #paint(model: BoardMaterialModel): void {
    const doc = this.ownerDocument;
    const items = this.#items;
    const active = Math.min(this.#active, Math.max(0, items.length - 1));
    const accent = styleColor(model.style.accentColor, BOARD_DEFAULT_SURFACE.accentColor);
    const color = styleColor(model.style.color, '#8aa4c0');
    const borderColor = styleColor(model.style.borderColor, BOARD_DEFAULT_SURFACE.borderColor);
    const radius = Math.max(0, readNumber(model.style.borderRadius, 4));
    const fontSize = readNumber(model.style.fontSize, 16);
    const gap = Math.max(0, Math.round(readNumber(model.props.gap, 8)));

    const list = doc.createElement('div');
    list.dataset.boardTabs = '';
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', PluginBoardTabsElement.manifest.name);
    list.style.cssText = `display:flex;align-items:stretch;gap:${gap}px;width:100%;height:100%;box-sizing:border-box;`;

    items.forEach((item, index) => {
      const selected = index === active;
      const tab = doc.createElement('button');
      tab.type = 'button';
      tab.dataset.boardTabIndex = String(index);
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected && model.interactive ? 0 : -1;
      tab.textContent = item.label;
      tab.title = item.label;
      // 选中：选中色文字 + 底部 2px 指示条 + 选中色 16% 底；未选中只有细描边。
      tab.style.cssText = [
        'flex:1 1 0',
        'min-width:0',
        'margin:0',
        'padding:0 12px',
        'box-sizing:border-box',
        `border:1px solid ${selected ? accent : borderColor}`,
        `border-radius:${radius}px`,
        `background:${selected ? `color-mix(in srgb, ${accent} 16%, transparent)` : 'transparent'}`,
        `box-shadow:${selected ? `inset 0 -2px 0 ${accent}` : 'none'}`,
        `color:${selected ? accent : color}`,
        `font:${selected ? 600 : 400} ${fontSize}px/1 sans-serif`,
        'white-space:nowrap',
        'overflow:hidden',
        'text-overflow:ellipsis',
        `cursor:${model.interactive ? 'pointer' : 'inherit'}`,
        'transition:color 160ms ease,background-color 160ms ease,border-color 160ms ease',
      ].join(';');
      list.appendChild(tab);
    });

    // 收尾统一走 `commit()`：它就位画面、标记「已成功渲染过」，并清掉降级角标。
    this.commit(list);
  }

  /** `focus`：键盘切换时把焦点移到新标签；鼠标点击不移，避免出现焦点框。 */
  #select(index: number, focus = false): void {
    const model = this.materialModel;
    const item = this.#items[index];
    if (model?.interactive !== true || item === undefined || index === this.#active) return;
    this.#active = index;
    this.#paint(model);
    if (focus) this.querySelector<HTMLElement>(`[data-board-tab-index="${index}"]`)?.focus();
    this.dispatchEvent(
      new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          name: 'tabChange',
          payload: { index, label: item.label, value: item.value },
        },
      }),
    );
  }

  readonly #handleClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest<HTMLElement>('[data-board-tab-index]');
    if (tab == null) return;
    this.#select(Number(tab.dataset.boardTabIndex));
  };

  /** 左右方向键在标签间移动并切换（WAI-ARIA tabs 的自动激活模式）。 */
  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    if (this.materialModel?.interactive !== true || this.#items.length === 0) return;
    const count = this.#items.length;
    const next =
      event.key === 'ArrowRight'
        ? (this.#active + 1) % count
        : event.key === 'ArrowLeft'
          ? (this.#active - 1 + count) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    this.#select(next, true);
  };

  disconnectedCallback(): void {
    this.removeEventListener('click', this.#handleClick);
    this.removeEventListener('keydown', this.#handleKeyDown);
  }

  override connectedCallback(): void {
    this.addEventListener('click', this.#handleClick);
    this.addEventListener('keydown', this.#handleKeyDown);
    super.connectedCallback();
  }
}

Object.defineProperty(PluginBoardTabsElement, 'tabularDataAdapter', {
  value: PLUGIN_BOARD_TABS_TABULAR_DATA_ADAPTER,
});

export function definePluginBoardTabsMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_TABS_MANIFEST,
    element: PluginBoardTabsElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
