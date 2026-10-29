import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScreenShape } from '../screens/screen.types';
import { ScreensService } from '../screens/screens.service';
import { requestAgentCompletion } from './agent-client';
import {
  AGENT_COMPONENT_EDIT_SYSTEM_PROMPT,
  type AgentComponentPatch,
  buildAgentComponentUserPrompt,
  deterministicComponentEdit,
  parseAgentComponentEditSpec,
  readEditableComponents,
} from './agent-component-edit';
import { composeScreenDocument } from './agent-compose';
import {
  AGENT_SYSTEM_PROMPT,
  type AgentChartPoint,
  type AgentPanel,
  type AgentScreenSpec,
  buildAgentUserPrompt,
} from './agent-spec';

export interface AgentCandidateResult {
  readonly name: string;
  readonly document: Record<string, unknown>;
  /** 本次实际走的通道；界面照实标注，不假装一定调了模型。 */
  readonly mode: 'llm' | 'deterministic';
  readonly imageCount: number;
  readonly failure?: string;
}

export interface AgentGenerateResult extends Omit<AgentCandidateResult, 'name' | 'document'> {
  readonly screen: ScreenShape;
}

export interface AgentComponentEditResult {
  readonly summary: string;
  readonly patches: readonly AgentComponentPatch[];
  readonly mode: 'llm' | 'deterministic';
  readonly failure?: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger('AgentService');

  constructor(
    private readonly screens: ScreensService,
    private readonly config: ConfigService,
  ) {}

  async generate(input: { topic: string; name?: string }): Promise<AgentGenerateResult> {
    const candidate = await this.generateCandidate(input);
    const created = await this.screens.create(input.name?.trim() || candidate.name);
    const saved = await this.screens.update(created.id, candidate.document, created.revision);
    return {
      screen: saved,
      mode: candidate.mode,
      imageCount: candidate.imageCount,
      ...(candidate.failure === undefined ? {} : { failure: candidate.failure }),
    };
  }

  async generateCandidate(input: { topic: string }): Promise<AgentCandidateResult> {
    const topic = input.topic.trim();
    const baseUrl = this.config.get<string>('AGENT_LLM_BASE_URL') ?? '';
    const apiKey = this.config.get<string>('AGENT_LLM_API_KEY') ?? '';
    const model = this.config.get<string>('AGENT_LLM_MODEL') ?? '';

    let spec = deterministicSpec(topic);
    let mode: 'llm' | 'deterministic' = 'deterministic';
    let failure: string | undefined;

    if (baseUrl !== '' && apiKey !== '' && model !== '') {
      const result = await requestAgentCompletion(
        { baseUrl, apiKey, model },
        AGENT_SYSTEM_PROMPT,
        buildAgentUserPrompt(topic),
        this.logger,
      );
      if (result.ok && result.text !== undefined) {
        const parsed = parseSpec(result.text);
        if (parsed === null) {
          failure = 'AGENT_SPEC_INVALID';
          this.logger.warn('agent spec rejected by validation');
        } else {
          spec = parsed;
          mode = 'llm';
        }
      } else {
        failure = result.failure ?? 'AGENT_FAILED';
      }
    } else {
      failure = 'AGENT_NOT_CONFIGURED';
    }

    const composed = composeScreenDocument({ ...spec, mode });
    return {
      name: spec.title,
      document: composed.document,
      mode,
      imageCount: composed.imageCount,
      ...(failure === undefined ? {} : { failure }),
    };
  }

  async editComponents(input: {
    instruction: string;
    components: readonly unknown[];
  }): Promise<AgentComponentEditResult> {
    const components = readEditableComponents(input.components);
    const instruction = input.instruction.trim();
    if (components === null) {
      return {
        summary: '组件上下文无效，未生成修改。',
        patches: [],
        mode: 'deterministic',
        failure: 'AGENT_COMPONENT_CONTEXT_INVALID',
      };
    }
    if (instruction === '') {
      return {
        summary: '修改指令为空，未生成修改。',
        patches: [],
        mode: 'deterministic',
        failure: 'AGENT_COMPONENT_INSTRUCTION_EMPTY',
      };
    }

    const baseUrl = this.config.get<string>('AGENT_LLM_BASE_URL') ?? '';
    const apiKey = this.config.get<string>('AGENT_LLM_API_KEY') ?? '';
    const model = this.config.get<string>('AGENT_LLM_MODEL') ?? '';
    let spec = deterministicComponentEdit(instruction, components);
    let mode: 'llm' | 'deterministic' = 'deterministic';
    let failure: string | undefined = spec === null ? undefined : 'AGENT_NOT_CONFIGURED';

    if (baseUrl !== '' && apiKey !== '' && model !== '') {
      const result = await requestAgentCompletion(
        { baseUrl, apiKey, model },
        AGENT_COMPONENT_EDIT_SYSTEM_PROMPT,
        buildAgentComponentUserPrompt(instruction, components),
        this.logger,
      );
      if (result.ok && result.text !== undefined) {
        const parsed = parseAgentComponentEditSpec(result.text, components);
        if (parsed === null) {
          failure = 'AGENT_SPEC_INVALID';
          this.logger.warn('component edit spec rejected by validation');
        } else {
          spec = parsed;
          mode = 'llm';
          failure = undefined;
        }
      } else {
        failure = result.failure ?? 'AGENT_FAILED';
      }
    }

    if (spec === null || spec.patches.length === 0) {
      return {
        summary: '没有可安全应用的组件修改。',
        patches: [],
        mode,
        failure: failure ?? 'AGENT_COMPONENT_INSTRUCTION_UNSUPPORTED',
      };
    }
    return {
      summary: spec.summary,
      patches: spec.patches,
      mode,
      ...(failure === undefined ? {} : { failure }),
    };
  }
}

/**
 * 没配模型或模型输出不可用时的兜底。
 *
 * 兜底也要给全 `points` / `items`——编译器不接受「只有标题、数据留空」的面板，否则又会
 * 退回预设数字。数值按主题哈希确定（同一主题可复现），页脚与副标题会写明未调用模型。
 */
function deterministicSpec(topic: string): AgentScreenSpec {
  const subject = topic === '' ? '示例大屏' : topic;
  const seed = hash(subject);
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const points: AgentChartPoint[] = days.map((label, index) => ({
    label,
    value: 40 + ((seed >>> (index * 3)) % 60),
  }));
  return {
    title: subject.slice(0, 10),
    subtitle: '示例智能体的确定性兜底 · 未调用模型',
    kpis: [
      {
        label: '总量',
        value: `${20 + (seed % 60)}.${seed % 10} 万`,
        delta: `+${seed % 9}.${(seed >>> 3) % 10}%`,
      },
      {
        label: '周转',
        value: `${20 + ((seed >>> 2) % 20)}.${(seed >>> 1) % 10} 天`,
        delta: `-${seed % 5}.${seed % 10}`,
      },
      { label: '缺货', value: `${seed % 30} 家`, delta: `+${seed % 7}` },
      { label: '在途', value: `${3000 + (seed % 2000)} 万` },
    ],
    panels: [
      { kind: 'chart', title: '近 7 日趋势', note: '按日汇总 · 相对量', points },
      { kind: 'image', title: '现场图' },
      {
        kind: 'list',
        title: '重点事项',
        note: '口径待确认',
        items: [`${subject.slice(0, 10)} · 指标口径待确认`, '数据源待接入', '明细维度待补齐'],
      },
    ],
  };
}

/**
 * 只接受结构完全对得上的 JSON；面板缺数据、类型不对就整份拒绝，不做猜测式修补。
 * 拒绝后由调用方退回确定性兜底，并在响应的 `failure` 里如实标注。
 */
export function parseSpec(text: string): AgentScreenSpec | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const subtitle = typeof record.subtitle === 'string' ? record.subtitle.trim() : '';
  if (title === '' || subtitle === '') return null;
  if (!Array.isArray(record.kpis) || !Array.isArray(record.panels)) return null;
  const kpis = record.kpis
    .slice(0, 5)
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const kpi = item as Record<string, unknown>;
      const label = typeof kpi.label === 'string' ? kpi.label.trim() : '';
      const value = typeof kpi.value === 'string' ? kpi.value.trim() : '';
      if (label === '' || value === '') return null;
      const delta = typeof kpi.delta === 'string' ? kpi.delta.trim() : undefined;
      return { label, value, ...(delta === undefined || delta === '' ? {} : { delta }) };
    })
    .filter((item): item is { label: string; value: string; delta?: string } => item !== null);
  const panels = readPanels(record.panels);
  if (panels === null) return null;
  if (kpis.length < 3 || panels.length < 3) return null;
  return { title: title.slice(0, 20), subtitle: subtitle.slice(0, 40), kpis, panels };
}

/** 面板逐项校验：图必须有 5–7 个点，清单必须有 3–5 条，缺一个就整份拒绝。 */
function readPanels(value: readonly unknown[]): readonly AgentPanel[] | null {
  const panels: AgentPanel[] = [];
  for (const item of value.slice(0, 4)) {
    if (typeof item !== 'object' || item === null) return null;
    const panel = item as Record<string, unknown>;
    const kind = panel.kind;
    const title = typeof panel.title === 'string' ? panel.title.trim() : '';
    if (title === '') return null;
    const note = typeof panel.note === 'string' ? panel.note.trim() : '';
    const base = { title: title.slice(0, 20), ...(note === '' ? {} : { note: note.slice(0, 40) }) };
    if (kind === 'chart') {
      const points = readChartPoints(panel.points);
      if (points === null) return null;
      panels.push({ kind, ...base, points });
      continue;
    }
    if (kind === 'list') {
      const items = readListItems(panel.items);
      if (items === null) return null;
      panels.push({ kind, ...base, items });
      continue;
    }
    if (kind === 'image') {
      const imageUrl = typeof panel.imageUrl === 'string' ? panel.imageUrl.trim() : '';
      panels.push({
        kind,
        ...base,
        ...(imageUrl.startsWith('https://') ? { imageUrl } : {}),
      });
      continue;
    }
    return null;
  }
  return panels;
}

function readChartPoints(value: unknown): readonly AgentChartPoint[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.slice(0, 7).map((item): AgentChartPoint | null => {
    if (typeof item !== 'object' || item === null) return null;
    const point = item as Record<string, unknown>;
    const label = typeof point.label === 'string' ? point.label.trim() : '';
    const raw = point.value;
    if (label === '' || label.length > 8) return null;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
    return { label, value: raw };
  });
  const points = parsed.filter((point): point is AgentChartPoint => point !== null);
  if (points.length !== parsed.length) return null;
  if (points.length < 5) return null;
  // 全零的柱形看不出任何信息，等同于没给数据。
  if (points.every((point) => point.value === 0)) return null;
  return points;
}

function readListItems(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.slice(0, 5).map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (items.some((item) => item === '' || item.length > 24)) return null;
  return items.length >= 3 ? items : null;
}

/** FNV-1a：兜底数值只求稳定可复现，不承担任何业务含义。 */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
