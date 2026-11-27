import type { ScreenJsonValue } from '@base-screen/contracts';

/**
 * 意图层看到的组件目录（ADR-0113 §2.1）。
 *
 * 纯 JSON 形状，`host-kit` 不认识物料契约：把设计器真实的 `BaseScreenMaterialCatalog` 变成这份形状
 * 是宿主的事（示例宿主的 `buildAgentCatalog`）。这样意图层不依赖 `plugin-core`，也不随物料契约变。
 */

/** 物料的取值形态：manifest 的 `staticData.kind`；没有 `staticData` 的物料记 `none`。 */
export type IntentCatalogData = 'tabular' | 'scalar' | 'none';

export interface IntentCatalogProp {
  readonly kind: 'string' | 'number' | 'boolean' | 'enum';
  readonly values?: readonly string[];
}

export interface IntentCatalogRole {
  readonly id: string;
  readonly min: number;
  readonly max: number;
  /**
   * manifest 角色声明的 `valueTypes`（ADR-0114 S1 ③）：显式绑定时据此校验字段类型。
   * 缺省表示宿主没上送（旧宿主），只校验字段存在与数量上下限。
   */
  readonly valueTypes?: readonly ('string' | 'number' | 'boolean' | 'date')[];
}

/** 本轮数据候选（`core` `enumerateScreenDataCandidates` 的结果），由宿主画像之后附上。 */
export interface IntentDataCandidate {
  readonly id: string;
  readonly fact: string;
  readonly datasetId: string;
  readonly type: string;
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

/** 事件负载顶层字段的形态（取自事件声明的 `payloadSchema`）。 */
export type IntentCatalogPayloadKind = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * 物料事件（ADR-0115 D3）：manifest 的 `events` 加上编辑器描述符里的 `payloadSchema` 顶层字段。
 * `row` 为对象且没有声明属性时表示「一行数据，键是绑定的字段 id」。没声明负载的事件 `payload` 为空：
 * 可以触发显隐，不能带值筛选。
 */
export interface IntentCatalogEvent {
  readonly name: string;
  readonly label?: string;
  readonly payload: Readonly<Record<string, IntentCatalogPayloadKind>>;
}

export interface IntentCatalogMaterial {
  readonly type: string;
  readonly name: string;
  readonly category: string;
  readonly data: IntentCatalogData;
  /** manifest 的 `hostResourceSelection`：该物料能被素材身份直接赋值。 */
  readonly asset: boolean;
  /**
   * manifest 的 `designCapabilities.children`：该物料能当外壳容纳子组件（`base.container`）。
   * 外壳是编译器的组合手段，不是模型能挑的块类型——解析会拒绝把它当块，提示词里也不列它。
   */
  readonly children?: boolean;
  readonly size: { readonly width: number; readonly height: number };
  readonly props: Readonly<Record<string, IntentCatalogProp>>;
  readonly roles: readonly IntentCatalogRole[];
  /** 物料声明的事件；缺省表示宿主没上送（旧宿主），这一物料不能当联动来源。 */
  readonly events?: readonly IntentCatalogEvent[];
  readonly defaults: {
    readonly props: Readonly<Record<string, ScreenJsonValue>>;
    readonly style: Readonly<Record<string, ScreenJsonValue>>;
  };
}

export interface IntentCatalogAsset {
  readonly id: string;
  readonly name: string;
}

export interface IntentCatalog {
  readonly materials: readonly IntentCatalogMaterial[];
  readonly assets: readonly IntentCatalogAsset[];
  /**
   * 本轮可引用的数据候选（ADR-0114 D4）：块写 `candidate: 'c3'` 时据此展开成物料与绑定。
   * 只有引用了数据集、且宿主做过画像时才有。
   */
  readonly candidates?: readonly IntentDataCandidate[];
}

/** 目录摘要进不了提示词的兜底：标题类文本物料。 */
export function pickTextMaterial(catalog: IntentCatalog): IntentCatalogMaterial | undefined {
  return catalog.materials.find(
    (material) =>
      material.data === 'scalar' && typeof material.defaults.style.fontSize === 'number',
  );
}

/**
 * 非矩形形状：这类物料铺成整块会变成椭圆/线条/箭头，绝不能当底板。
 * 目录里 `base.ellipse` 的 type 排在 `base.rectangle` 前面，早先只按「无数据 + 有 fill」挑，
 * 结果整屏背景被铺成一颗巨大的椭圆——形状语义必须在选择时就排除掉。
 */
const NON_RECT_SHAPE_PATTERN =
  /(?:^|[-.])(?:ellipse|oval|circle|triangle|polygon|star|arrow|line|rule|connector|divider)(?:$|[-.])/i;
const RECT_SHAPE_PATTERN =
  /(?:^|[-.])(?:rectangle|rect|card|panel|surface|box|frame|tile)(?:$|[-.])/i;
const NON_RECT_NAME_PATTERN = /(椭圆|圆形|圆|三角|多边形|星形|箭头|线条|连线|分隔线)/;
const RECT_NAME_PATTERN = /(矩形|方形|底板|卡片|面板|背景|容器|框架|色块)/;

/**
 * 卡片底板：无数据、默认样式里带纯色填充的装饰物料。
 *
 * 只挑矩形语义的：type 命中 `rectangle/card/panel/...`、名称命中「矩形/卡片/底板/...」，
 * 或至少声明了 `borderRadius`（形状物料里只有矩形暴露这个键，椭圆固定 50%）。
 * 拿不到合格底板时返回 undefined——宁可不出卡片，也不要把一颗椭圆拉成整屏。
 */
export function pickSurfaceMaterial(catalog: IntentCatalog): IntentCatalogMaterial | undefined {
  let best: IntentCatalogMaterial | undefined;
  let bestScore = -1;
  for (const material of catalog.materials) {
    if (material.data !== 'none' || material.children === true) continue;
    if (typeof material.defaults.style.fill !== 'string') continue;
    if (NON_RECT_SHAPE_PATTERN.test(material.type)) continue;
    if (NON_RECT_NAME_PATTERN.test(material.name)) continue;

    let score = 0;
    if (/(?:^|[-.])rect(?:angle)?(?:$|[-.])/i.test(material.type)) score += 4;
    if (RECT_SHAPE_PATTERN.test(material.type)) score += 2;
    if (material.name.includes('矩形')) score += 3;
    if (RECT_NAME_PATTERN.test(material.name)) score += 1;
    if ('borderRadius' in material.defaults.style) score += 1;

    if (score > bestScore) {
      best = material;
      bestScore = score;
    }
  }
  return best;
}

/**
 * 组合用的外壳：声明了 `children` 的无数据物料（`base.container`）。
 *
 * 外壳让一张指标卡、一个图表块成为可整体移动 / 复制 / 删除的一个单元（ADR-0100 的组合分片）。
 * 目录里没有可用外壳时返回 undefined，编译器退回平铺并在产物里如实说明，不静默降级。
 */
export function pickShellMaterial(catalog: IntentCatalog): IntentCatalogMaterial | undefined {
  return catalog.materials.find(
    (material) => material.children === true && material.data === 'none',
  );
}
