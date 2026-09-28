import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialModel,
  BaseScreenMaterialTabularDataAdapter,
  ScreenParseResult,
} from '../../packages/plugin-core/src/index.ts';
import { createMaterialPackage } from '../../packages/plugin-sdk/src/index.ts';

/**
 * 模拟“宿主托管的可信远程物料包”：由宿主加载并审核的独立物料模块。
 * 本模块只声明 manifest/constructor 并复用 createMaterialPackage 校验与注册，
 * 不包含任何网络加载逻辑；远程性由宿主的分发与加载阶段承担（ADR-0029）。
 */

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

abstract class HostedMaterialElement extends ElementBase {
  #model: BaseScreenMaterialModel | undefined;

  get model(): BaseScreenMaterialModel {
    if (this.#model === undefined) {
      throw new Error('Material model has not been set.');
    }
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    this.#model = value;
    this.renderMaterial();
  }

  connectedCallback(): void {
    this.renderMaterial();
  }

  protected get materialModel(): BaseScreenMaterialModel | undefined {
    return this.#model;
  }

  protected abstract renderMaterial(): void;
}

const hostedBadgeManifest = {
  type: 'harness.hosted-badge',
  tagName: 'harness-hosted-badge',
  name: '托管徽章',
  category: '托管',
  keywords: ['hosted'],
  defaultSize: { width: 260, height: 72 },
  defaultProps: { label: '托管徽章' },
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: {
    kind: 'object' as const,
    properties: { label: { kind: 'string' as const } },
    required: ['label'],
  },
  propertyPanel: [{ prop: 'label', label: '标签', control: 'text' as const }],
  events: ['valueClick'],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: false, children: false },
};

class HostedBadgeElement extends HostedMaterialElement {
  static readonly manifest = hostedBadgeManifest;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    const badge = this.ownerDocument.createElement('span');
    badge.textContent = String(model.props.label ?? '');
    badge.style.display = 'inline-block';
    badge.style.padding = '8px 16px';
    badge.style.borderRadius = '999px';
    badge.style.background = '#1d4ed8';
    badge.style.color = '#ffffff';
    badge.style.font = '14px/1 system-ui, sans-serif';
    this.appendChild(badge);
  }
}

const hostedMetricManifest = {
  type: 'harness.hosted-metric',
  tagName: 'harness-hosted-metric',
  name: '托管指标',
  category: '托管',
  keywords: ['hosted'],
  // 宿主封面（ADR-0040）：根相对 URL，Designer 物料库卡片在缩略图区渲染该图。
  cover: '/cover.svg',
  defaultSize: { width: 260, height: 96 },
  defaultProps: {},
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: { kind: 'object' as const, properties: {}, required: [] },
  propertyPanel: [],
  events: [],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: false, children: false },
};

class HostedMetricElement extends HostedMaterialElement {
  static readonly manifest = hostedMetricManifest;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    const value =
      model.dataState.status === 'ready' && typeof model.dataState.value === 'string'
        ? model.dataState.value
        : '--';
    const metric = this.ownerDocument.createElement('span');
    metric.textContent = value;
    metric.style.display = 'block';
    metric.style.font = '28px/1.2 system-ui, sans-serif';
    metric.style.color = '#34d399';
    metric.style.fontWeight = '700';
    this.appendChild(metric);
  }
}

const hostedTinyManifest = {
  type: 'harness.hosted-tiny',
  tagName: 'harness-hosted-tiny',
  name: '托管窄条',
  category: '托管',
  keywords: ['hosted'],
  // 自适应封面（ADR-0041）：200x24 窄条与 16:10 缩略图区宽高比偏差极大，
  // 引擎应以 contain 完整显示，不放大、不裁切。
  cover: '/tiny-cover.svg',
  defaultSize: { width: 260, height: 96 },
  defaultProps: {},
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: { kind: 'object' as const, properties: {}, required: [] },
  propertyPanel: [],
  events: [],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: false, children: false },
};

class HostedTinyElement extends HostedMaterialElement {
  static readonly manifest = hostedTinyManifest;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    const strip = this.ownerDocument.createElement('span');
    strip.textContent = String(model.props.label ?? '');
    strip.style.display = 'inline-block';
    strip.style.padding = '4px 10px';
    strip.style.background = '#f59e0b';
    strip.style.color = '#1c1917';
    strip.style.font = '12px/1 system-ui, sans-serif';
    this.appendChild(strip);
  }
}

/**
 * 数据集驱动自定义物料最佳实践：
 *
 * - Manifest 只声明稳定字段角色，不感知 URL、SQL 或宿主查询实现；
 * - adapter 把宿主表格数据投影为组件自己的最小视图模型；
 * - element 只消费投影结果，并完整处理 loading / empty / error / ready；
 * - staticData 与 host-resource 共用同一 adapter，作者可先用示例数据完成视觉设计。
 */
export const hostedDatasetRankingManifest = {
  type: 'harness.dataset-ranking',
  tagName: 'harness-dataset-ranking',
  name: '数据集排行卡',
  category: '最佳实践',
  keywords: ['数据集', '排行', '自定义组件', '最佳实践'],
  cover: '/dataset-ranking-cover.svg',
  defaultSize: { width: 420, height: 220 },
  defaultProps: { title: '区域营收排行', unit: '万元', maxItems: 5, showRank: true },
  defaultData: {
    fields: [
      { id: 'category', label: '区域', valueType: 'string', nullable: false },
      { id: 'amount', label: '营收', valueType: 'number', nullable: false, unit: '万元' },
    ],
    rows: [
      { category: '华东', amount: 128 },
      { category: '华南', amount: 96 },
      { category: '华北', amount: 82 },
      { category: '西南', amount: 64 },
      { category: '西北', amount: 41 },
    ],
  },
  staticData: {
    kind: 'tabular' as const,
    defaultBinding: { fields: { dimension: ['category'], measures: ['amount'] } },
  },
  defaultStyle: {
    backgroundColor: '#0b1324',
    textColor: '#e5eefb',
    mutedColor: '#8ea3bd',
    accentColor: '#31d7eb',
    trackColor: '#1b2b42',
  },
  propsSchema: {
    kind: 'object' as const,
    properties: {
      title: { kind: 'string' as const, minLength: 1, maxLength: 64 },
      unit: { kind: 'string' as const, maxLength: 16 },
      maxItems: { kind: 'number' as const, minimum: 1, maximum: 12 },
      showRank: { kind: 'boolean' as const },
    },
    required: ['title', 'unit', 'maxItems', 'showRank'],
  },
  propertyPanel: [
    { prop: 'title', label: '标题', control: 'text' as const },
    { prop: 'unit', label: '单位', control: 'text' as const },
    { prop: 'maxItems', label: '最多显示', control: 'number' as const },
    { prop: 'showRank', label: '显示排名', control: 'boolean' as const },
  ],
  styleSchema: {
    kind: 'object' as const,
    properties: {
      backgroundColor: { kind: 'string' as const },
      textColor: { kind: 'string' as const },
      mutedColor: { kind: 'string' as const },
      accentColor: { kind: 'string' as const },
      trackColor: { kind: 'string' as const },
    },
    required: ['backgroundColor', 'textColor', 'mutedColor', 'accentColor', 'trackColor'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color' as const },
    { style: 'textColor', label: '文字色', control: 'color' as const },
    { style: 'mutedColor', label: '辅助色', control: 'color' as const },
    { style: 'accentColor', label: '强调色', control: 'color' as const },
    { style: 'trackColor', label: '轨道色', control: 'color' as const },
  ],
  events: ['itemClick'],
  dataCapabilities: ['static' as const, 'dataset' as const],
  dataBinding: {
    roles: [
      {
        id: 'dimension',
        minFields: 1,
        maxFields: 1,
        valueTypes: ['string' as const, 'date' as const],
      },
      { id: 'measures', minFields: 1, maxFields: 1, valueTypes: ['number' as const] },
    ],
  },
  designCapabilities: { resize: true, rotate: false, children: false },
};

interface RankingItem {
  readonly label: string;
  readonly value: number;
}

class HostedDatasetRankingElement extends HostedMaterialElement {
  static readonly manifest = hostedDatasetRankingManifest;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.padding = '16px 18px';
    this.style.border = `1px solid ${color(model.style.accentColor, '#31d7eb')}33`;
    this.style.borderRadius = '14px';
    this.style.background = color(model.style.backgroundColor, '#0b1324');
    this.style.color = color(model.style.textColor, '#e5eefb');
    this.style.font = '12px/1.4 system-ui, sans-serif';

    const heading = this.ownerDocument.createElement('header');
    heading.textContent = text(model.props.title, '区域营收排行');
    heading.style.cssText =
      'margin-bottom: 12px; overflow: hidden; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap;';
    this.appendChild(heading);

    if (model.dataState.status !== 'ready') {
      this.appendChild(
        this.stateMessage(
          model.dataState.status === 'loading'
            ? '正在加载数据…'
            : model.dataState.status === 'error'
              ? '数据加载失败'
              : '等待数据',
        ),
      );
      return;
    }
    const items = readRankingItems(model.dataState.value).slice(
      0,
      Math.max(1, Math.min(12, Math.trunc(number(model.props.maxItems, 5)))),
    );
    if (items.length === 0) {
      this.appendChild(this.stateMessage('暂无可展示数据'));
      return;
    }
    const maximum = Math.max(1, ...items.map((item) => Math.max(0, item.value)));
    const list = this.ownerDocument.createElement('ol');
    list.style.cssText =
      'display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; min-height: 0;';
    items.forEach((item, index) => list.appendChild(this.rankingRow(item, index, maximum)));
    this.appendChild(list);
  }

  private rankingRow(item: RankingItem, index: number, maximum: number): HTMLElement {
    const model = this.model;
    const row = this.ownerDocument.createElement('li');
    row.style.minWidth = '0';
    const button = this.ownerDocument.createElement('button');
    button.type = 'button';
    button.style.cssText =
      'display: grid; grid-template-columns: 24px minmax(64px, 1fr) minmax(80px, 2fr) auto; align-items: center; gap: 8px; min-width: 0; padding: 0; border: 0; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer;';
    button.setAttribute('aria-label', `${item.label} ${item.value}`);
    const rank = this.ownerDocument.createElement('span');
    rank.textContent = model.props.showRank === false ? '•' : String(index + 1).padStart(2, '0');
    rank.style.color = color(model.style.mutedColor, '#8ea3bd');
    const label = this.ownerDocument.createElement('span');
    label.textContent = item.label;
    label.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    const track = this.ownerDocument.createElement('span');
    track.style.cssText = `display:block;height:6px;overflow:hidden;border-radius:999px;background:${color(model.style.trackColor, '#1b2b42')};`;
    const fill = this.ownerDocument.createElement('i');
    fill.style.cssText = `display:block;width:${Math.max(0, Math.min(100, (item.value / maximum) * 100))}%;height:100%;border-radius:inherit;background:${color(model.style.accentColor, '#31d7eb')};`;
    track.appendChild(fill);
    const value = this.ownerDocument.createElement('strong');
    value.textContent = `${item.value.toLocaleString('zh-CN')}${text(model.props.unit, '')}`;
    value.style.cssText = 'font-variant-numeric: tabular-nums; white-space: nowrap;';
    button.append(rank, label, track, value);
    button.addEventListener('click', () => {
      if (this.model.interactive !== true) return;
      this.dispatchEvent(
        new CustomEvent('base-screen-material-event', {
          bubbles: true,
          composed: true,
          detail: {
            name: 'itemClick',
            payload: { rowIndex: index, label: item.label, value: item.value },
          },
        }),
      );
    });
    row.appendChild(button);
    return row;
  }

  private stateMessage(message: string): HTMLElement {
    const state = this.ownerDocument.createElement('div');
    state.textContent = message;
    state.style.cssText =
      'display:grid;place-items:center;height:calc(100% - 34px);color:#8ea3bd;font-size:12px;';
    return state;
  }
}

const hostedDatasetRankingAdapter: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }) {
    const dimension = fields.dimension?.[0];
    const measure = fields.measures?.[0];
    if (dimension === undefined || measure === undefined) return invalidRankingProjection();
    return {
      ok: true,
      value: {
        items: dataset.rows.flatMap((row) => {
          const label = row[dimension.id];
          const value = row[measure.id];
          return (typeof label === 'string' || typeof label === 'number') &&
            typeof value === 'number' &&
            Number.isFinite(value)
            ? [{ label: String(label), value }]
            : [];
        }),
      },
      diagnostics: [],
    };
  },
};

Object.defineProperty(HostedDatasetRankingElement, 'tabularDataAdapter', {
  value: hostedDatasetRankingAdapter,
});

function readRankingItems(value: unknown): RankingItem[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  const items = (value as { readonly items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    const label = (item as { readonly label?: unknown }).label;
    const value = (item as { readonly value?: unknown }).value;
    return typeof label === 'string' && typeof value === 'number' && Number.isFinite(value)
      ? [{ label, value }]
      : [];
  });
}

function invalidRankingProjection(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        path: [],
        message: 'Dataset ranking binding is invalid.',
      },
    ],
  };
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const draftBadgeManifest = {
  ...hostedBadgeManifest,
  type: 'harness.draft-badge',
  tagName: 'harness-draft-badge',
  name: '草稿徽章',
};

class DraftBadgeElement extends HostedBadgeElement {
  static readonly manifest = draftBadgeManifest;
}

const packageResult = createMaterialPackage({
  id: 'harness.hosted',
  materials: [
    {
      manifest: hostedBadgeManifest,
      element: HostedBadgeElement as never,
    },
    {
      manifest: hostedMetricManifest,
      element: HostedMetricElement as never,
    },
    {
      manifest: hostedTinyManifest,
      element: HostedTinyElement as never,
    },
    {
      manifest: hostedDatasetRankingManifest,
      element: HostedDatasetRankingElement as never,
    },
  ],
});

if (!packageResult.ok) {
  throw new Error('Hosted material package fixture is invalid.');
}

export const hostedMaterialPackage = packageResult.value;

const draftPackageResult = createMaterialPackage({
  id: 'harness.draft',
  materials: [{ manifest: draftBadgeManifest, element: DraftBadgeElement as never }],
});

if (!draftPackageResult.ok) throw new Error('Draft material package fixture is invalid.');

export const draftMaterialPackage = draftPackageResult.value;

/** auto-register 风格入口（等价外部包 /auto-register 出口）：导入后调用即注册全部物料。 */
export function autoRegisterHostedMaterialPackage(): ScreenParseResult<
  readonly BaseScreenMaterialCatalogEntry[]
> {
  return hostedMaterialPackage.define();
}
