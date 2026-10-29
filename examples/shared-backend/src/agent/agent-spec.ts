/**
 * 智能体输出的中间表示。
 *
 * 模型只负责「这屏讲什么、有哪些模块、模块里的数长什么样」，不直接写 Screen Document：
 * 组件树由 `agent-compose.ts` 确定性编译，非法结构进不来。这也是报告里
 * 「Agent 写可编译的中间表示、设计器做编译器后端」的落点。
 */
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

export interface AgentScreenSpec {
  readonly title: string;
  readonly subtitle: string;
  readonly kpis: readonly AgentKpi[];
  readonly panels: readonly AgentPanel[];
  /** 由调用方补充：模型与耗时，用于界面上如实标注。 */
  readonly mode?: 'llm' | 'deterministic';
}

export const AGENT_SYSTEM_PROMPT = `你是一个大屏信息架构师。用户给你一个主题，你只输出 JSON，不要解释。

JSON 结构：
{
  "title": "大屏标题，8 字以内",
  "subtitle": "一句口径说明，20 字以内",
  "kpis": [{ "label": "指标名", "value": "数值", "delta": "+4.2%" }],
  "panels": [
    {
      "kind": "chart",
      "title": "趋势标题",
      "note": "单位：万元",
      "points": [{ "label": "周一", "value": 128 }, { "label": "周二", "value": 164 }]
    },
    {
      "kind": "list",
      "title": "清单标题",
      "note": "按影响范围排序",
      "items": ["华东渠道缺货 12 家", "在途补货 4.1 万件", "周转天数 31 天"]
    },
    { "kind": "image", "title": "现场图", "note": "巡检画面" }
  ]
}

约束：
- kpis 3 到 5 个，value 必须带单位或百分号，delta 可省略。
- panels 3 到 4 个，至少一个是 image，至少一个是 chart。
- chart 面板必须给 points：5 到 7 个点，label 不超过 4 个字（日期写成 10-23 这种），value 是数字（不带单位，单位写进 note），各点数值要有明显差异，不要全部相同。
- list 面板必须给 items：3 到 5 条，每条不超过 18 个字，写主题对应的具体口径与数量，不要写「示例」「待补充」这类占位词。
- image 面板不要给 points 或 items。
- 所有数字必须服从同一个主题口径，彼此能对上；不要复述用户原句。
- 全部使用简体中文，不要 emoji，不要 markdown，不要代码块围栏。`;

export function buildAgentUserPrompt(topic: string): string {
  return `主题：${topic}\n请按系统提示的结构输出 JSON。`;
}
