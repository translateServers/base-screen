import { FALLBACK_AGENT_CATALOG } from '../src/agent/agent-catalog';
import { readDataSummary } from '../src/agent/agent-data-context';
import { readRepairRequest } from '../src/agent/agent-repair';
import { buildEditOpsSystemPrompt, readEditOps } from '../src/agent/agent-session';
import { buildIntentSystemPrompt } from '../src/agent/agent-spec';

/**
 * ADR-0114 S4（后端一侧）：宿主随数据集引用上送的画像与候选，只读、校验形状后写进意图提示词。
 */
describe('agent data context', () => {
  const reference = {
    kind: 'dataset',
    datasetId: 'monitor.crew',
    profile: {
      datasetId: 'monitor.crew',
      sampled: true,
      rows: { sampled: 6, total: 6, truncated: false },
      grain: { keys: ['crew'], unique: true },
      fields: [
        { id: 'crew', label: '班组', kind: 'dimension', distinct: 6 },
        {
          id: 'oee',
          label: 'OEE',
          kind: 'measure',
          unit: '%',
          distinct: 6,
          number: { min: 79.4, max: 86.5 },
        },
      ],
    },
    candidates: [
      {
        id: 'c1',
        fact: 'categorization',
        type: 'base.chart',
        fields: { dimension: ['crew'], measures: ['oee'] },
      },
      { id: 'x9', fact: 'categorization', type: 'base.chart', fields: { dimension: ['crew'] } },
      { id: 'c2', fact: 'unknown', type: 'base.chart', fields: { dimension: ['crew'] } },
    ],
  };

  it('keeps only well-formed candidates and describes the profile', () => {
    const summary = readDataSummary(reference);

    expect(summary?.candidates.map((item) => item.id)).toEqual(['c1']);
    expect(summary?.lines).toEqual([
      '样本 6 行，共 6 行',
      '已按 crew 汇总（每组一行）',
      '字段：crew（班组，维度，6 个取值）；oee（OEE，度量，%，6 个取值，79.4–86.5）',
    ]);
  });

  it('says plainly when there is no sample', () => {
    const summary = readDataSummary({
      ...reference,
      profile: { ...reference.profile, sampled: false },
    });
    expect(summary?.lines[0]).toContain('没有取到样本');
  });

  it('puts the profile, the parameter rule and the candidate table into the intent prompt', () => {
    const summary = readDataSummary(reference);
    const prompt = buildIntentSystemPrompt(FALLBACK_AGENT_CATALOG, {
      assets: [],
      datasets: [
        {
          datasetId: 'monitor.crew',
          name: '班组绩效',
          columns: ['crew', 'oee'],
          missingParams: ['line'],
          paramChoices: [{ name: 'line', allowed: ['LINE-A', 'LINE-B'] }],
          ...(summary === undefined ? {} : { summary }),
        },
      ],
    });

    expect(prompt).toContain('候选 c1：分类对比，base.chart（dimension=crew，measures=oee）');
    expect(prompt).toContain('参数 line 必填，可选 LINE-A / LINE-B');
    expect(prompt).toContain('"candidate": "c1"');
    expect(prompt).not.toContain('x9');
    // 只有分类候选、没有单值候选：提醒指标带少放（S7 评测 F1）。
    expect(prompt).toContain('band 只放 3 个');
  });

  it('accepts a rebind op and explains it in the edit prompt when data is referenced', () => {
    const ops = readEditOps(
      JSON.stringify({
        summary: '换成真实数据',
        ops: [{ op: 'rebind', target: 'blocks[0]', bind: { candidate: 'c1' } }],
      }),
    );
    expect(ops?.ops[0]).toMatchObject({ op: 'rebind', bind: { candidate: 'c1' } });
    expect(
      readEditOps(JSON.stringify({ summary: 'x', ops: [{ op: 'rebind', target: 'blocks[0]' }] })),
    ).toBeNull();

    const summary = readDataSummary(reference);
    const digest = { title: '班组', subtitle: '今日', regions: [] };
    const withData = buildEditOpsSystemPrompt(FALLBACK_AGENT_CATALOG, digest, {
      assets: [],
      datasets: [
        {
          datasetId: 'monitor.crew',
          name: '班组绩效',
          columns: ['crew', 'oee'],
          ...(summary === undefined ? {} : { summary }),
        },
      ],
    });
    expect(withData).toContain('"op": "rebind"');
    expect(buildEditOpsSystemPrompt(FALLBACK_AGENT_CATALOG, digest)).not.toContain('rebind');
  });

  it('gives the model a concrete hint for sample-check and binding codes', () => {
    const request = readRepairRequest({
      output: '{}',
      issues: [
        { code: 'DATA_RESULT_EMPTY', path: 'regions[1].blocks[0]' },
        { code: 'AGENT_BINDING_FIELD_UNKNOWN', path: 'blocks[0]' },
      ],
    });
    expect(request?.issues.map((issue) => issue.hint)).toEqual([
      expect.stringContaining('查不到数据'),
      expect.stringContaining('画像里列出的'),
    ]);
  });
});
