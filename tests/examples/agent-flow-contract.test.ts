import { parseScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { FALLBACK_AGENT_CATALOG } from '../../examples/shared-backend/src/agent/agent-catalog';
import { composeScreenDocument } from '../../examples/shared-backend/src/agent/agent-compose';
import type { AgentScreenSpec } from '../../examples/shared-backend/src/agent/agent-spec';

/**
 * 智能体链路的契约层：编译器产物必须通过 canonical 契约解析器。
 *
 * 后端是 CJS 且刻意不依赖契约包（见 screen-document-guard.ts），所以「产物合法」这一判定
 * 放在根级 Vitest 里做：这里直接导入后端的纯编译函数，再交给 `parseScreenDocument`。
 * 这是报告里「智能体产物写 legacy 字段、靠迁移兜底」问题的回归防线：产物必须是 canonical 形态。
 */

const SPEC: AgentScreenSpec = {
  title: '华东仓网库存水位',
  subtitle: '口径：周末快照',
  kpis: [
    { label: '总库存', value: '28.6 万件', delta: '+4.2%' },
    { label: '周转天数', value: '23.7 天', delta: '-1.1%' },
    { label: '缺货仓', value: '15 家' },
  ],
  blocks: [
    {
      type: 'base.chart',
      title: '各仓水位',
      note: '单位：%',
      span: 2,
      table: {
        columns: [
          { id: 'site', label: '仓库', type: 'string' },
          { id: 'level', label: '水位', type: 'number' },
        ],
        rows: [
          { site: '上海', level: 92 },
          { site: '杭州', level: 88 },
          { site: '南京', level: 79 },
        ],
      },
    },
    {
      type: 'base.chart',
      title: '周转趋势',
      span: 2,
      table: {
        columns: [
          { id: 'day', label: '日期', type: 'string' },
          { id: 'turn', label: '周转', type: 'number' },
        ],
        rows: [
          { day: '10-24', turn: 24 },
          { day: '10-25', turn: 23 },
        ],
      },
    },
  ],
  mode: 'llm',
};

function composeOk(spec: AgentScreenSpec) {
  const outcome = composeScreenDocument({ spec, catalog: FALLBACK_AGENT_CATALOG });
  if (!outcome.ok) {
    throw new Error(`compose failed: ${JSON.stringify(outcome.diagnostics)}`);
  }
  return outcome.value;
}

describe('agent flow contract: compiled output is canonical', () => {
  it('编译出的文档通过 parseScreenDocument，且无错误诊断', () => {
    const { document } = composeOk(SPEC);
    const parsed = parseScreenDocument(document);
    expect(parsed.ok, JSON.stringify(parsed.diagnostics)).toBe(true);
  });

  it('产物使用 canonical 取值形态：表格数据是 dataValue，legacy dataSource 显式为 null', () => {
    const { document } = composeOk(SPEC);
    const components = document.components as {
      type: string;
      dataSource?: unknown;
      dataValue?: { kind?: string } | null;
    }[];
    // 每个组件都显式携带 dataSource 键且为 null：不是「缺字段」，而是明确不用 legacy 形态。
    for (const component of components) {
      expect(Object.hasOwn(component, 'dataSource')).toBe(true);
      expect(component.dataSource).toBeNull();
    }
    // 图表的数据走 canonical inline 值，而不是 legacy 数据源。
    const chart = components.find((component) => component.type === 'base.chart');
    expect(chart?.dataValue?.kind).toBe('inline');
  });

  it('编译是确定的：同一 spec 两次编译得到完全相同的文档', () => {
    const first = composeOk(SPEC).document;
    const second = composeOk(SPEC).document;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('输入不被编译器修改（纯函数）', () => {
    const snapshot = JSON.stringify(SPEC);
    composeOk(SPEC);
    expect(JSON.stringify(SPEC)).toBe(snapshot);
  });

  it('目录外的物料类型被丢弃，产物仍合法且不含未知 type', () => {
    const withUnknown: AgentScreenSpec = {
      ...SPEC,
      blocks: [
        ...(SPEC.blocks ?? []),
        { type: 'vendor.unknown.widget', title: '不存在的组件', span: 2 },
      ],
    };
    const { document } = composeOk(withUnknown);
    const parsed = parseScreenDocument(document);
    expect(parsed.ok, JSON.stringify(parsed.diagnostics)).toBe(true);
    const types = (document.components as { type: string }[]).map((component) => component.type);
    expect(types).not.toContain('vendor.unknown.widget');
  });

  it('兜底（无模型产物）的确定性文档同样通过契约', () => {
    const fallback: AgentScreenSpec = {
      title: '示例大屏',
      subtitle: '示例智能体的确定性兜底 · 未调用模型',
      kpis: [{ label: '总量', value: '35.5 万' }],
      blocks: [],
      mode: 'deterministic',
    };
    const { document } = composeOk(fallback);
    expect(parseScreenDocument(document).ok).toBe(true);
  });
});
