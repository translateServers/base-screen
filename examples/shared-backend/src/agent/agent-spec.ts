/**
 * 智能体输出的中间表示。
 *
 * 模型只负责「这屏讲什么、有哪些模块、配哪些图」，不直接写 Screen Document：
 * 组件树由 `agent-compose.ts` 确定性编译，非法结构进不来。这也是报告里
 * 「Agent 写可编译的中间表示、设计器做编译器后端」的落点。
 */
export interface AgentKpi {
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
}

export type AgentPanelKind = 'chart' | 'list' | 'image';

export interface AgentPanel {
  readonly kind: AgentPanelKind;
  readonly title: string;
  readonly note?: string;
  /** 图片面板的配图；留空时由后端按标题生成一个稳定的图片地址。 */
  readonly imageUrl?: string;
}

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
  "panels": [{ "kind": "chart|list|image", "title": "模块标题", "note": "一句话说明" }]
}

约束：
- kpis 3 到 5 个，value 必须带单位或百分号，delta 可省略。
- panels 3 到 4 个，至少一个是 image，至少一个是 chart。
- 全部使用简体中文，不要 emoji，不要 markdown，不要代码块围栏。`;

export function buildAgentUserPrompt(topic: string): string {
  return `主题：${topic}\n请按系统提示的结构输出 JSON。`;
}
