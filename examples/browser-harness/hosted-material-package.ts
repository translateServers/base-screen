import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialModel,
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
