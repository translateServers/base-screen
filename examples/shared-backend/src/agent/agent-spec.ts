/** 智能体输出的中间表示。
 *
 * 模型只负责「这屏讲什么、有哪些模块、模块里的数长什么样」，不直接写 Screen Document：
 * 组件树由 `agent-compose.ts` 确定性编译，非法结构进不来。这也是报告里
 * 「Agent 写可编译的中间表示、设计器做编译器后端」的落点。
 */
import type { AgentCatalog } from './agent-catalog';
import { renderCatalogPrompt } from './agent-catalog';
import { STYLE_PRESET_IDS, STYLE_PRESETS } from './agent-style';
export interface AgentKpi {
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
}

/** 图表的一个数据点：柱高按同一面板内的最大值归一，单位写在面板 `note` 里。 */
export interface AgentChartPoint {
  readonly label: string;
  readonly value: number;
}

interface AgentPanelBase {
  readonly title: string;
  readonly note?: string;
}

/** 图表面板：`points` 是模型给出的数据，编译器不补任何预设柱值。 */
export interface AgentChartPanel extends AgentPanelBase {
  readonly kind: 'chart';
  readonly points: readonly AgentChartPoint[];
}

/** 清单面板：`items` 是模型给出的明细，编译器不补任何预设文案。 */
export interface AgentListPanel extends AgentPanelBase {
  readonly kind: 'list';
  readonly items: readonly string[];
}

/** 图片面板：宿主要按标题取图，不要求模型给数据。 */
export interface AgentImagePanel extends AgentPanelBase {
  readonly kind: 'image';
  /** 模型给的配图；留空时由编译器按标题生成一个稳定的图片地址。 */
  readonly imageUrl?: string;
}

export type AgentPanel = AgentChartPanel | AgentListPanel | AgentImagePanel;

/** 表格载荷：模型给的是「列 + 行」，绑定角色由编译器按目录里的 roles 分配。 */
export interface AgentBlockColumn {
  readonly id: string;
  readonly label: string;
  readonly type: 'string' | 'number' | 'boolean';
}

export interface AgentBlockTable {
  readonly columns: readonly AgentBlockColumn[];
  readonly rows: readonly Readonly<Record<string, string | number | boolean>>[];
}

/**
 * 目录驱动的图块：`type` 必须是宿主目录里真实存在的物料。
 *
 * 与 v1 的 `panels`（chart / list / image 三种写死形态）相比，这里不再替模型决定
 * 「用什么组件」——模型从目录里挑，编译器只负责把它变成合法文档。
 */
export interface AgentBlock {
  readonly type: string;
  readonly title: string;
  readonly note?: string;
  /** 四列栅格里占几列，1–4。 */
  readonly span: number;
  readonly text?: string;
  readonly assetId?: string;
  /** 引用数据集：由宿主指定的 datasetId，交给编译器落成数据源实例与绑定。 */
  readonly datasetId?: string;
  readonly table?: AgentBlockTable;
  readonly props?: Readonly<Record<string, string | number | boolean>>;
}

export interface AgentScreenSpec {
  readonly title: string;
  readonly subtitle: string;
  /** 模型选择的风格预设 id（见 agent-style.ts）；缺省或非法时由编译前回退到默认预设。 */
  readonly style?: string;
  readonly kpis: readonly AgentKpi[];
  /** v1：写死的三种面板形态；仅当模型仍输出旧结构时使用。 */
  readonly panels?: readonly AgentPanel[];
  /** v2：目录驱动的图块。 */
  readonly blocks?: readonly AgentBlock[];
  /** 由调用方补充：模型与耗时，用于界面上如实标注。 */
  readonly mode?: 'llm' | 'deterministic';
}

export function buildAgentUserPrompt(topic: string): string {
  return `主题：${topic}\n请按系统提示的结构输出 JSON。`;
}

/**
 * v2 系统提示词：组件清单来自宿主目录，不再由后端写死。
 *
 * 保留原 v1 提示词的「只输出 JSON / 数字要能对上 / 简体中文」这些纪律，把
 * 「哪些组件能用」整段换成目录摘要；模型不再自己描述柱高与清单，而是给表格数据。
 */
export interface AgentPromptReferences {
  readonly assets: readonly { readonly id: string; readonly name: string }[];
  readonly datasets: readonly {
    readonly datasetId: string;
    readonly name: string;
    readonly columns: readonly string[];
  }[];
}

/**
 * 引用落到块上的硬规则。
 *
 * 有数据集引用时不允许再给 table：模型很愿意用「顺手编的示例数据」，那样用户引用的数据集
 * 就白选了——产物看起来正常，但屏上跑的是假数据。
 */
function referenceRule(references: AgentPromptReferences): string {
  if (references.datasets.length > 0) {
    return '数据型块必须给 datasetId（只能用上面列出的引用数据集），不要给 table、也不要同时给两者。';
  }
  return '数据型块给 table（示例数据）；没有引用数据集时不要写 datasetId。';
}

/** 用户本轮显式引用的素材与数据集：模型必须用上，不能编造别的 id。 */
function renderReferencesPrompt(references: AgentPromptReferences | undefined): string {
  if (references === undefined) return '';
  const lines: string[] = [];
  for (const asset of references.assets)
    lines.push(`- 素材：${asset.name}（assetId: ${asset.id}）`);
  for (const dataset of references.datasets) {
    const columns = dataset.columns.length === 0 ? '字段未知' : dataset.columns.join(' / ');
    lines.push(`- 数据集：${dataset.name}（datasetId: ${dataset.datasetId}，字段：${columns}）`);
  }
  if (lines.length === 0) return '';
  return `

用户在本轮已指定以下引用，必须用上，不要编造其他 id：
${lines.join('\n')}
${referenceRule(references)}`;
}

export function buildCatalogSystemPrompt(
  catalog: AgentCatalog,
  references?: AgentPromptReferences,
): string {
  return `你是一个大屏信息架构师。用户给你一个主题，你只输出 JSON，不要解释。

${renderCatalogPrompt(catalog)}${renderReferencesPrompt(references)}

输出结构：
{
  "title": "大屏标题，12 字以内",
  "subtitle": "一句口径说明，20 字以内",
  "style": "从下列风格中选一个 id，按主题气质选：${STYLE_PRESET_IDS.map((id) => `${id}=${STYLE_PRESETS[id].label}`).join('；')}",
  "kpis": [{ "label": "指标名", "value": "数值", "delta": "+4.2%" }],
  "blocks": [
    {
      "type": "上面列出的某个 type",
      "title": "块标题，10 字以内",
      "note": "单位或口径，18 字以内",
      "span": 2,
      "table": {
        "columns": [{ "id": "day", "label": "日期", "type": "string" }, { "id": "amount", "label": "金额", "type": "number" }],
        "rows": [{ "day": "10-24", "amount": 128 }]
      }
    }
  ]
}

约束：
- kpis 3 到 5 个，value 必须带单位或百分号，delta 可省略。
- blocks 3 到 4 个，覆盖「趋势 / 结构 / 明细」；用户要求结论或要点时，用一个文字类块承载，不要塞进 note。
- span 取 1 到 4，表示在四列栅格里占几列。数据型组件 span 取 2 到 4（一列宽约 430px，放不下多列表头会挤成一团）；
  文字与素材类块 span 取 1 到 2。同一行 span 之和要凑满 4（4、2+2、3+1），不要留下半行空位。
- 数据型组件必须给 table：columns 1 到 4 列，rows 3 到 8 行；图表类要有一个字符串列做维度、至少一个数值列做度量。
  超过 8 行会被自动裁剪，宁可少几行；饼图尤其控制在 8 行以内。
- 组件参数里如果图型可选（如 seriesType 的 line/bar/area/pie），按数据形态选：时间序列用 line 或 area，
  分类对比（品类、城市、渠道）用 bar，占比用 pie；不要一律用折线。
- 值型组件给 text；如果给了「可用静态素材」，图片类组件优先用 assetId（只能写列表里的 id），不要编造图片地址。
- 无数据组件只给 type 与 span，可以带 title。
- props 只能写该组件「参数」里列出的键，枚举只能取列出的值；没列出的键不要写。
- 不要给组件写颜色、字号等样式，视觉由宿主统一决定。
- 所有数字必须服从同一个主题口径，彼此能对上；不要复述用户原句，不要写「示例」「待补充」。
- 全部使用简体中文，不要 emoji，不要 markdown，不要代码块围栏。`;
}
