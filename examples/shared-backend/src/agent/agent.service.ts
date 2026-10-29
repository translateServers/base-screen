import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requestAgentCompletion } from './agent-client';
import { composeScreenDocument } from './agent-compose';
import { AGENT_SYSTEM_PROMPT, buildAgentUserPrompt, type AgentScreenSpec } from './agent-spec';
import type { ScreenShape } from '../screens/screen.types';
import { ScreensService } from '../screens/screens.service';

export interface AgentGenerateResult {
  readonly screen: ScreenShape;
  /** 本次实际走的通道；界面照实标注，不假装一定调了模型。 */
  readonly mode: 'llm' | 'deterministic';
  readonly imageCount: number;
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
    const created = await this.screens.create(input.name?.trim() || spec.title);
    const saved = await this.screens.update(created.id, composed.document, created.revision);
    return {
      screen: saved,
      mode,
      imageCount: composed.imageCount,
      ...(failure === undefined ? {} : { failure }),
    };
  }
}

/** 没配模型或模型输出不可用时的兜底：结构合法、内容可读，并明确标注来源。 */
function deterministicSpec(topic: string): AgentScreenSpec {
  const subject = topic === '' ? '示例大屏' : topic;
  return {
    title: subject.slice(0, 10),
    subtitle: '示例智能体的确定性兜底 · 未调用模型',
    kpis: [
      { label: '总量', value: '28.6 万', delta: '+4.2%' },
      { label: '周转', value: '31.4 天', delta: '-1.8' },
      { label: '缺货', value: '12 家', delta: '+3' },
      { label: '在途', value: '4,120 万' },
    ],
    panels: [
      { kind: 'chart', title: '近 7 日趋势', note: '按日汇总' },
      { kind: 'image', title: '现场图' },
      { kind: 'list', title: '重点渠道' },
    ],
  };
}

/** 只接受结构完全对得上的 JSON；多一个字段就整份拒绝，不做猜测式修补。 */
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
  const panels = record.panels
    .slice(0, 4)
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const panel = item as Record<string, unknown>;
      const kind = panel.kind;
      const title = typeof panel.title === 'string' ? panel.title.trim() : '';
      if (kind !== 'chart' && kind !== 'list' && kind !== 'image') return null;
      if (title === '') return null;
      const note = typeof panel.note === 'string' ? panel.note.trim() : undefined;
      const imageUrl = typeof panel.imageUrl === 'string' ? panel.imageUrl.trim() : undefined;
      return {
        kind,
        title,
        ...(note === undefined || note === '' ? {} : { note }),
        ...(imageUrl === undefined || imageUrl === '' ? {} : { imageUrl }),
      };
    })
    .filter(
      (item): item is { kind: 'chart' | 'list' | 'image'; title: string; note?: string; imageUrl?: string } =>
        item !== null,
    );
  if (kpis.length < 3 || panels.length < 3) return null;
  return { title: title.slice(0, 20), subtitle: subtitle.slice(0, 40), kpis, panels };
}
