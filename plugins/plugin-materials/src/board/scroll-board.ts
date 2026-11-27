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
  BOARD_ALARM_LEVEL_COLORS,
  type BoardAlarmLevelKey,
  PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  PLUGIN_BOARD_SCROLL_BOARD_TYPE,
} from './identity.js';
import { readBoolean, readNumber, readString, styleColor } from './json-values.js';
import { createBoardColumnsAdapter } from './tabular-columns-adapter.js';

/**
 * 轮播列表：用滚动动画在固定区域内轮流展示多行明细。
 *
 * 与配套大屏产品的轮播列表同形：表头可选、视口高度固定为「行数 × 行高」、内容按行上滚。
 * 视口高度不随数据条数变化，滚动只改 track 的 transform，因此不会因为数据更新而
 * 改变组件几何（样式稳定性：不得抖动）。
 *
 * 等级色列（ADR-0099）：
 * - 「哪一列是等级」是字段映射，经数据区的 `field-selector` 选择，
 *   值仍存为 `statusColumn`（列 id）。
 *   它没有改成独立的数据绑定角色：表格数据契约（`parseBaseScreenTableData`）严格只有
 *   `columns`/`rows`/`totalRowCount`，适配器无法额外携带「等级列」标记；而本物料同时接收
 *   静态与变量数据，那两条通道根本没有绑定角色。
 * - 「等级 → 颜色」是语义色，属于 style（可被条件样式与 `theme:` 引用覆盖），四个键共用一组：
 *   `criticalColor` / `warningColor` / `infoColor` / `unknownColor`（未知等级的兜底）。
 */
const PLUGIN_BOARD_SCROLL_BOARD_EVENTS = ['rowClick'] as const;

const SCROLL_BOARD_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    headerVisible: { kind: 'boolean' },
    rowCount: { kind: 'number', minimum: 1, maximum: 50 },
    intervalMs: { kind: 'number', minimum: 200, maximum: 60_000 },
    autoScroll: { kind: 'boolean' },
    // 列 id（不是字段标签）。指向 `columns` 绑定里的某一列；不在绑定里时按「未启用」处理。
    statusColumn: { kind: 'string', maxLength: 64 },
  },
  // `statusColumn` 不进 required：不启用等级色列的文档不必写它。
  required: ['headerVisible', 'rowCount', 'intervalMs', 'autoScroll'],
} satisfies BaseScreenMaterialObjectSchema;

const SCROLL_BOARD_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    color: { kind: 'string' },
    headerColor: { kind: 'string' },
    accentColor: { kind: 'string' },
    borderColor: { kind: 'string' },
    fontSize: { kind: 'number', minimum: 10, maximum: 32 },
    rowHeight: { kind: 'number', minimum: 20, maximum: 96 },
    criticalColor: { kind: 'string' },
    warningColor: { kind: 'string' },
    infoColor: { kind: 'string' },
    unknownColor: { kind: 'string' },
  },
  // 等级色不进 required：缺省时回落到共用等级色板 `BOARD_ALARM_LEVEL_COLORS`。
  required: ['backgroundColor', 'color', 'headerColor', 'accentColor', 'borderColor'],
} satisfies BaseScreenMaterialObjectSchema;

export const PLUGIN_BOARD_SCROLL_BOARD_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_SCROLL_BOARD_TYPE,
  tagName: PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  name: '轮播列表',
  category: '指标',
  keywords: ['列表', '轮播', '滚动', '大屏'],
  defaultSize: { width: 420, height: 220 },
  // 原子化：只做「在固定视口里轮播多行明细」。标题属于说明文字，应由文档层的
  // `base.text` 组合；表头是数据自身的列名，不是说明文字，故保留。
  defaultProps: {
    headerVisible: true,
    rowCount: 5,
    intervalMs: 3000,
    autoScroll: true,
    // 等级色列默认关闭：空列 id 即「未启用」，不渲染色条。
    statusColumn: '',
  },
  defaultData: {
    fields: [
      { id: 'name', label: '名称', valueType: 'string', nullable: false },
      { id: 'value', label: '数值', valueType: 'number', nullable: false },
    ],
    rows: [
      { name: '上海', value: 982 },
      { name: '深圳', value: 871 },
      { name: '北京', value: 763 },
      { name: '杭州', value: 654 },
      { name: '成都', value: 542 },
      { name: '广州', value: 498 },
    ],
  },
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { columns: ['name', 'value'] } },
  },
  defaultStyle: {
    backgroundColor: '#0b1a2b',
    color: '#e6f1ff',
    headerColor: '#8aa4c0',
    accentColor: '#38bdf8',
    borderColor: '#1e3a5f',
    fontSize: 14,
    rowHeight: 34,
    criticalColor: BOARD_ALARM_LEVEL_COLORS.critical,
    warningColor: BOARD_ALARM_LEVEL_COLORS.warning,
    infoColor: BOARD_ALARM_LEVEL_COLORS.info,
    unknownColor: BOARD_ALARM_LEVEL_COLORS.unknown,
  },
  styleSchema: SCROLL_BOARD_STYLE_SCHEMA,
  stylePanel: [],
  propsSchema: SCROLL_BOARD_PROPS_SCHEMA,
  propertyPanel: [],
  editorDescriptor: parseScrollBoardEditorDescriptor(),
  events: [...PLUGIN_BOARD_SCROLL_BOARD_EVENTS],
  dataCapabilities: ['static', 'dataset', 'variable', 'host-resource'],
  dataBinding: {
    roles: [
      {
        id: 'columns',
        minFields: 1,
        maxFields: 64,
        valueTypes: ['string', 'number', 'boolean', 'date'],
      },
    ],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

/**
 * 检查器编排（ADR-0099 §2.3/§2.4）：外观区按「结构 → 文字 → 填充与描边 → 语义色 → 动效」排列，
 * 等级列是字段映射，放数据区用 `field-selector`。描述符是唯一的表单来源（ADR-0102 D1）：
 * 多选批量与条件样式同样从它识别可编辑字段。
 */
function parseScrollBoardEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      // 事件负载（ADR-0115 D3）。
      events: [
        {
          name: 'rowClick',
          label: '点击行',
          hint: '负载带被点的行（键为绑定的字段 id）与行号。',
          payloadSchema: {
            kind: 'object',
            properties: {
              rowIndex: { kind: 'number' },
              row: { kind: 'object', properties: {}, required: [] },
            },
            required: ['rowIndex', 'row'],
          },
        },
      ],
      appearance: [
        {
          id: 'structure',
          label: '结构',
          fields: [
            {
              id: 'headerVisible',
              target: 'props',
              path: ['headerVisible'],
              label: '显示表头',
              control: 'boolean',
            },
            {
              id: 'rowCount',
              target: 'props',
              path: ['rowCount'],
              label: '可见行数',
              control: 'number',
              min: 1,
              max: 50,
            },
            {
              id: 'rowHeight',
              target: 'style',
              path: ['rowHeight'],
              label: '行高',
              unit: 'px',
              min: 20,
              max: 96,
            },
          ],
        },
        {
          id: 'text',
          label: '文字',
          fields: [
            { id: 'color', target: 'style', path: ['color'], label: '文字色', control: 'color' },
            {
              id: 'headerColor',
              target: 'style',
              path: ['headerColor'],
              label: '表头色',
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
              label: '分隔线色',
              control: 'color',
            },
            {
              id: 'accentColor',
              target: 'style',
              path: ['accentColor'],
              label: '强调色',
              control: 'color',
            },
          ],
        },
        {
          id: 'levels',
          label: '语义色',
          collapsed: true,
          help: '数据区选定等级列后生效；未知等级使用未知等级色。',
          fields: [
            {
              id: 'criticalColor',
              target: 'style',
              path: ['criticalColor'],
              label: '严重色',
              control: 'color',
            },
            {
              id: 'warningColor',
              target: 'style',
              path: ['warningColor'],
              label: '警告色',
              control: 'color',
            },
            {
              id: 'infoColor',
              target: 'style',
              path: ['infoColor'],
              label: '提示色',
              control: 'color',
            },
            {
              id: 'unknownColor',
              target: 'style',
              path: ['unknownColor'],
              label: '未知等级色',
              control: 'color',
            },
          ],
        },
        {
          id: 'motion',
          label: '动效',
          advanced: true,
          fields: [
            {
              id: 'autoScroll',
              target: 'props',
              path: ['autoScroll'],
              label: '自动轮播',
              control: 'boolean',
            },
            {
              id: 'intervalMs',
              target: 'props',
              path: ['intervalMs'],
              label: '轮播间隔',
              control: 'unit-number',
              unit: 'ms',
              min: 200,
              max: 60_000,
              step: 100,
              when: [{ path: ['autoScroll'], operator: 'eq', value: true }],
            },
          ],
        },
      ],
      data: [
        {
          id: 'levelColumn',
          label: '等级色列',
          fields: [
            {
              id: 'statusColumn',
              target: 'props',
              path: ['statusColumn'],
              label: '等级列',
              control: 'field-selector',
              help: '选中的列按 critical / warning / info 着色；留空则不启用。',
            },
          ],
        },
      ],
    },
    SCROLL_BOARD_PROPS_SCHEMA,
    SCROLL_BOARD_STYLE_SCHEMA,
    PLUGIN_BOARD_SCROLL_BOARD_EVENTS,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials scroll board editor descriptor is invalid.');
  }
  return parsed.value;
}

export class PluginBoardScrollBoardElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_SCROLL_BOARD_MANIFEST;

  #timer: ReturnType<typeof setInterval> | undefined;
  #offset = 0;
  #rows: readonly Record<string, unknown>[] = [];
  /** roving tabindex 的当前行：整块看板只占一个 Tab 停靠点。 */
  #activeRow = 0;
  /** 重渲染前焦点在看板内：数据刷新会整块重建，重建后要把焦点放回当前行。 */
  #restoreFocus = false;

  protected renderMaterial(): void {
    // :focus-within 能穿过 shadow 边界判断（物料挂在查看器的 shadow root 里）。
    this.#restoreFocus = typeof this.matches === 'function' && this.matches(':focus-within');
    this.#stopTimer();
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    // 显隐归渲染器（组件隐藏、画板外组件、蓝图显隐都写 display:none），这里不能覆盖成 block。

    if (this.style.display !== 'none') this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, '#0b1a2b');
    this.style.color = styleColor(model.style.color, '#e6f1ff');
    this.setAttribute('role', 'table');
    // a11y 名称取物料清单名，不来自文档：物料不再有标题字段。
    this.setAttribute('aria-label', PluginBoardScrollBoardElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    const parsed = parseBaseScreenTableData(model.dataState.value);
    if (!parsed.ok) {
      this.appendDataStatePlaceholder({
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: '列表数据格式无效',
      });
      return;
    }
    this.#paint(parsed.value, model);
  }

  #paint(data: BaseScreenTableData, model: BoardMaterialModel): void {
    const doc = this.ownerDocument;
    const rowHeight = readNumber(model.style.rowHeight, 34);
    const rowCount = Math.max(1, Math.round(readNumber(model.props.rowCount, 5)));
    const headerVisible = readBoolean(model.props.headerVisible, true);
    const fontSize = readNumber(model.style.fontSize, 14);
    const borderColor = styleColor(model.style.borderColor, '#1e3a5f');
    this.#rows = data.rows;
    // 等级色列：列 id 不在绑定里时一律按「未启用」处理（列 id 是配置，不是契约，不报错）。
    const statusColumnId = readString(model.props.statusColumn, '');
    const statusColumnIndex =
      statusColumnId === '' ? -1 : data.columns.findIndex((column) => column.id === statusColumnId);
    const palette = alarmLevelPalette(model.style);

    const root = doc.createElement('div');
    root.dataset.boardScrollBoard = '';
    // 只有表头 + 视口：没有标题行，整块高度都留给数据行。
    root.style.cssText =
      'display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;padding:6px 10px;';

    if (headerVisible) {
      const header = doc.createElement('div');
      header.dataset.boardHeader = '';
      header.setAttribute('role', 'row');
      header.style.cssText = `flex:0 0 auto;display:flex;height:${rowHeight}px;align-items:center;border-bottom:1px solid ${borderColor};color:${styleColor(model.style.headerColor, '#8aa4c0')};font:600 ${fontSize}px/1 sans-serif;`;
      // 启用等级色条时表头补一个等宽占位，否则表头与数据列会错开 4 px + 间距。
      if (statusColumnIndex >= 0) header.appendChild(this.#statusBar('transparent'));
      for (const column of data.columns) {
        header.appendChild(this.#cell(column.label, 1, fontSize, false, undefined, 'columnheader'));
      }
      root.appendChild(header);
    }

    const viewport = doc.createElement('div');
    viewport.dataset.boardViewport = '';
    // 视口高度由「行数 × 行高」决定，与数据条数无关：数据增减不会改变组件几何。
    viewport.style.cssText = `flex:1 1 auto;position:relative;overflow:hidden;min-height:0;`;
    const visibleCount = Math.min(rowCount, Math.max(1, data.rows.length));
    const track = doc.createElement('div');
    track.dataset.boardTrack = '';
    track.style.cssText = `position:absolute;left:0;right:0;top:0;will-change:transform;`;
    // 键盘：只有一个 Tab 停靠点，上下方向键 / Home / End 在行间移动，Enter / 空格触发 rowClick。
    // 设计态（不可交互）不设 tabindex、不监听按键：方向键要留给设计器微调组件位置。
    const interactive = model.interactive;
    const lines: HTMLElement[] = [];
    this.#activeRow = Math.min(this.#activeRow, Math.max(0, data.rows.length - 1));
    const moveTo = (index: number): void => {
      const next = lines[index];
      if (next === undefined) return;
      lines[this.#activeRow]?.setAttribute('tabindex', '-1');
      next.setAttribute('tabindex', '0');
      this.#activeRow = index;
      // 视口 overflow:hidden 且由 transform 轮播：不让浏览器滚动视口，由 focusin 负责把行移进视口。
      next.focus({ preventScroll: true });
    };
    data.rows.forEach((row, rowIndex) => {
      const line = doc.createElement('div');
      line.dataset.boardRow = String(rowIndex);
      line.setAttribute('role', 'row');
      if (interactive) line.setAttribute('tabindex', rowIndex === this.#activeRow ? '0' : '-1');
      line.setAttribute(
        'aria-label',
        `第 ${rowIndex + 1} 行：${data.columns
          .map((column) => `${column.label} ${String(row[column.id] ?? '')}`)
          .join('，')}`,
      );
      line.style.cssText = `display:flex;height:${rowHeight}px;align-items:center;border-bottom:1px solid ${borderColor};font:${fontSize}px/1 sans-serif;`;
      let statusColor: string | undefined;
      if (statusColumnIndex >= 0) {
        const statusColumn = data.columns[statusColumnIndex];
        const raw = statusColumn === undefined ? undefined : row[statusColumn.id];
        const level = typeof raw === 'string' ? raw : '';
        statusColor = alarmLevelColor(palette, level);
        // 行级属性便于断言与样式钩子；色条不是唯一编码，行内等级文字仍然保留。
        line.dataset.boardRowStatus = level === '' ? 'unknown' : level;
        line.appendChild(this.#statusBar(statusColor));
      }
      data.columns.forEach((column, columnIndex) => {
        const value = row[column.id];
        line.appendChild(
          this.#cell(
            value === null || value === undefined ? '' : String(value),
            columnIndex,
            fontSize,
            columnIndex === data.columns.length - 1,
            columnIndex === statusColumnIndex ? statusColor : undefined,
          ),
        );
      });
      line.addEventListener('click', () => this.#emitRowClick(rowIndex, row));
      if (interactive) {
        // 浏览器默认焦点框在深色看板上几乎看不见（WCAG 2.4.7）：聚焦时用文字色画 2px 内描边。
        line.addEventListener('focus', () => {
          line.style.outline = `2px solid ${styleColor(model.style.color, '#e6f1ff')}`;
          line.style.outlineOffset = '-2px';
        });
        line.addEventListener('blur', () => {
          line.style.outline = '';
          line.style.outlineOffset = '';
        });
        line.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.#emitRowClick(rowIndex, row);
            return;
          }
          const last = data.rows.length - 1;
          const target =
            event.key === 'ArrowDown'
              ? Math.min(rowIndex + 1, last)
              : event.key === 'ArrowUp'
                ? Math.max(rowIndex - 1, 0)
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? last
                    : undefined;
          if (target === undefined) return;
          event.preventDefault();
          moveTo(target);
        });
      }
      lines.push(line);
      track.appendChild(line);
    });
    viewport.appendChild(track);
    root.appendChild(viewport);
    this.commit(root);

    // 只有真正容纳不下的数据才轮播；一屏能放下时保持静止（也就不会无谓地消耗定时器）。
    const scrolls = readBoolean(model.props.autoScroll, true) && data.rows.length > visibleCount;
    if (scrolls) {
      this.#startTimer(viewport, track, rowHeight, visibleCount, model);
    }
    if (interactive) {
      // 键盘焦点进入看板时暂停轮播并把焦点行移进视口（否则焦点可能落在视口外、或被轮播滚走）；
      // 焦点离开看板后恢复轮播。
      viewport.addEventListener('focusin', (event) => {
        const index = Number((event.target as HTMLElement).dataset.boardRow);
        if (!Number.isInteger(index)) return;
        this.#stopTimer();
        this.#offset = Math.max(0, Math.min(index, data.rows.length - visibleCount));
        track.style.transition = 'none';
        track.style.transform = `translateY(${-this.#offset * rowHeight}px)`;
      });
      viewport.addEventListener('focusout', (event) => {
        // 数据刷新整块重建时，被移除的旧视口也会派发 focusout：它已不在文档里，不能再起定时器。
        if (!viewport.isConnected) return;
        if (event.relatedTarget instanceof Node && viewport.contains(event.relatedTarget)) return;
        if (scrolls && this.#timer === undefined) {
          this.#startTimer(viewport, track, rowHeight, visibleCount, model);
        }
      });
      // 放回焦点会触发上面的 focusin：轮播随之暂停，焦点行移进视口。
      if (this.#restoreFocus) lines[this.#activeRow]?.focus({ preventScroll: true });
    }
    this.#restoreFocus = false;
  }

  /** 行左 4 px 状态色条：与文字并存，因此色盲也能读出行等级。 */
  #statusBar(color: string): HTMLElement {
    const bar = this.ownerDocument.createElement('span');
    bar.dataset.boardStatusBar = '';
    bar.style.cssText = `flex:0 0 4px;align-self:stretch;background:${color};margin-right:6px;border-radius:2px;`;
    return bar;
  }

  #cell(
    text: string,
    columnIndex: number,
    fontSize: number,
    alignEnd = false,
    color?: string,
    role: 'cell' | 'columnheader' = 'cell',
  ): HTMLElement {
    const cell = this.ownerDocument.createElement('span');
    cell.dataset.boardCell = String(columnIndex);
    cell.setAttribute('role', role);
    cell.textContent = text;
    const colorStyle = color === undefined ? '' : `color:${color};`;
    cell.style.cssText = `flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${fontSize}px;${colorStyle}${alignEnd ? 'text-align:right;font-variant-numeric:tabular-nums;' : ''}`;
    return cell;
  }

  #startTimer(
    viewport: HTMLElement,
    track: HTMLElement,
    rowHeight: number,
    visibleCount: number,
    model: BoardMaterialModel,
  ): void {
    // 减少动效不能等于停播：视口 overflow:hidden，停播后超出一屏的行永远看不到。
    // 改为整页、无过渡地翻页，信息照样轮到，只是没有滑动。
    const reduceMotion =
      this.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ??
      false;
    // 同一时刻只允许一个轮播定时器：重复启动会让多个定时器同时推进 #offset。
    this.#stopTimer();
    const interval = Math.max(200, Math.round(readNumber(model.props.intervalMs, 3000)));
    // 视口高度 = 可见行数 × 行高；读取一次，之后只做 transform，不触碰布局属性。
    viewport.dataset.boardVisibleRows = String(visibleCount);
    this.#offset = 0;
    this.#timer = setInterval(() => {
      const rows = this.#rows.length;
      if (reduceMotion) {
        this.#offset = this.#offset + visibleCount >= rows ? 0 : this.#offset + visibleCount;
        track.style.transition = 'none';
        track.style.transform = `translateY(${-this.#offset * rowHeight}px)`;
        return;
      }
      this.#offset += 1;
      // 滚过末尾后从顶部无缝接回：位移取模，避免累积成越来越大的 translate 值。
      const shift = this.#offset % rows;
      track.style.transition = 'transform 420ms cubic-bezier(.33,1,.68,1)';
      track.style.transform = `translateY(${-shift * rowHeight}px)`;
      if (shift === 0) {
        // 归位那一帧不带动画，否则会看到一次从底部弹回顶部的长行程滚动。
        track.style.transition = 'none';
        window.requestAnimationFrame(() => {
          track.style.transition = 'transform 420ms cubic-bezier(.33,1,.68,1)';
        });
      }
    }, interval);
  }

  #stopTimer(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  #emitRowClick(rowIndex: number, row: Record<string, unknown>): void {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
        bubbles: true,
        composed: true,
        detail: { name: 'rowClick', payload: { rowIndex, row } },
      }),
    );
  }

  disconnectedCallback(): void {
    this.#stopTimer();
  }
}

/**
 * 列投影走共用工厂（`createBoardColumnsAdapter`）：`scroll-board` / `status-grid` /
 * `pipeline` 的「表格 → 视图模型」只有一份实现。导出名保持不变（外部按名字引用）。
 */
export const PLUGIN_BOARD_SCROLL_BOARD_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter =
  createBoardColumnsAdapter('columns');

/**
 * 从 style 读出告警等级色（语义色组，ADR-0099 §2.6）：`criticalColor` 等扁平键优先，
 * 缺省回落到共用等级色板 `BOARD_ALARM_LEVEL_COLORS`。
 */
function alarmLevelPalette(
  style: Readonly<Record<string, unknown>>,
): Readonly<Record<BoardAlarmLevelKey, string>> {
  return {
    critical: styleColor(style.criticalColor, BOARD_ALARM_LEVEL_COLORS.critical),
    warning: styleColor(style.warningColor, BOARD_ALARM_LEVEL_COLORS.warning),
    info: styleColor(style.infoColor, BOARD_ALARM_LEVEL_COLORS.info),
    unknown: styleColor(style.unknownColor, BOARD_ALARM_LEVEL_COLORS.unknown),
  };
}

function isAlarmLevelKey(value: string): value is Exclude<BoardAlarmLevelKey, 'unknown'> {
  return value !== 'unknown' && Object.hasOwn(BOARD_ALARM_LEVEL_COLORS, value);
}

/**
 * 等级 → 颜色：critical / warning / info 取各自等级色，其余（含空值、中文等级名）一律取未知等级色。
 * 未知等级不报错、不进失败计数（等级是数据内容，不是配置错误）。
 */
function alarmLevelColor(
  palette: Readonly<Record<BoardAlarmLevelKey, string>>,
  level: string,
): string {
  return isAlarmLevelKey(level) ? palette[level] : palette.unknown;
}

Object.defineProperty(PluginBoardScrollBoardElement, 'tabularDataAdapter', {
  value: PLUGIN_BOARD_SCROLL_BOARD_TABULAR_DATA_ADAPTER,
});

export function definePluginBoardScrollBoardMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_SCROLL_BOARD_MANIFEST,
    element: PluginBoardScrollBoardElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
