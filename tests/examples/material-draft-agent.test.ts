import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_MATERIAL_FEW_SHOT_SPECS,
  AGENT_MATERIAL_SYSTEM_PROMPT,
  buildMaterialRepairPrompt,
  readMaterialRepairRequest,
} from '../../examples/shared-backend/src/agent/agent-material';
import {
  buildSpecMaterialModule,
  draftTemplateMaterialWithAgent,
  importSpecMaterialModule,
  MATERIAL_DRAFT_MAX_REPAIR_ROUNDS,
  type MaterialDraftAgentRequest,
  readSpecMaterialModule,
  readTemplateMaterialModule,
} from '../../examples/vanilla-host/src/screen/component-workshop';
import {
  auditBaseScreenMaterialSpec,
  BASE_SCREEN_MATERIAL_TEMPLATE_FUNCTIONS,
  BASE_SCREEN_MATERIAL_TEMPLATE_NODE_KINDS,
  type BaseScreenMaterialSpec,
  hasBaseScreenAuthoringErrors,
} from '../../packages/plugin-sdk/src/index';

/**
 * 组件工坊「让智能体起草」（ADR-0116 D7 / S6）：宿主侧的起草回环、L2 在线包格式，
 * 以及后端提示词与 SDK 的对齐。模型调用全部替换成桩。
 */
const GAUGE = AGENT_MATERIAL_FEW_SHOT_SPECS[0] as BaseScreenMaterialSpec;
const TYPE = 'host.online.draft-test';

function reply(spec: unknown, wrap = true): { ok: true; output: string } {
  return { ok: true, output: JSON.stringify(wrap ? { spec } : spec) };
}

/**
 * 某个节点的颜色引用一个没声明的样式字段：体检报 TPL2，路径指到那个节点
 * （few-shot 仪表的节点顺序：bg、scale、track、fill、reading）。
 */
function brokenGauge(nodeId = 'reading'): unknown {
  const template = GAUGE.template as NonNullable<BaseScreenMaterialSpec['template']>;
  return {
    ...GAUGE,
    template: {
      ...template,
      nodes: template.nodes.map((node) =>
        node.id !== nodeId
          ? node
          : node.kind === 'text' || node.kind === 'rect'
            ? { ...node, fill: 'style.nope' }
            : { ...node, stroke: 'style.nope' },
      ),
    },
  };
}

describe('backend prompt stays aligned with the SDK', () => {
  it('ships few-shot specs that pass the component audit', () => {
    for (const spec of AGENT_MATERIAL_FEW_SHOT_SPECS) {
      const findings = auditBaseScreenMaterialSpec(spec);
      expect(hasBaseScreenAuthoringErrors(findings), JSON.stringify(findings)).toBe(false);
    }
  });

  it('lists every template node kind and function the SDK accepts', () => {
    for (const kind of BASE_SCREEN_MATERIAL_TEMPLATE_NODE_KINDS) {
      expect(AGENT_MATERIAL_SYSTEM_PROMPT).toMatch(
        new RegExp(`(?:^|[^A-Za-z])${kind}(?:[^A-Za-z]|$)`),
      );
    }
    for (const name of BASE_SCREEN_MATERIAL_TEMPLATE_FUNCTIONS) {
      expect(AGENT_MATERIAL_SYSTEM_PROMPT).toContain(name);
    }
  });

  it('reads only well-formed repair requests', () => {
    const issue = { rule: 'TPL2', path: 'template.nodes[3].fill', message: '未声明的字段。' };
    expect(readMaterialRepairRequest({ output: '{}', issues: [issue] })).toEqual({
      output: '{}',
      issues: [issue],
    });
    for (const invalid of [
      null,
      [],
      { output: '', issues: [issue] },
      { output: '{}', issues: [] },
      { output: '{}', issues: [{ ...issue, rule: 'tpl2' }] },
      { output: '{}', issues: [{ ...issue, path: 'a b' }] },
      { output: '{}', issues: [{ ...issue, message: '' }] },
      { output: 'x'.repeat(64_001), issues: [issue] },
    ]) {
      expect(readMaterialRepairRequest(invalid)).toBeNull();
    }
  });

  it('lists each finding with its spec path in the repair prompt', () => {
    const prompt = buildMaterialRepairPrompt(
      [
        {
          rule: 'TPL2',
          path: 'template.nodes[3].fill',
          message: 'style.nope 不是规格里声明的样式字段。',
        },
        { rule: 'SPEC', path: '', message: '输出不是合法 JSON。' },
      ],
      '环形进度',
    );
    expect(prompt).toContain('[TPL2] template.nodes[3].fill：style.nope');
    expect(prompt).toContain('[SPEC] （整份）');
    expect(prompt).toContain('环形进度');
  });
});

describe('L2 online package format', () => {
  it('writes only the spec and reads it back without executing anything', async () => {
    const code = buildSpecMaterialModule(GAUGE, 'root.textContent = "ignored";');
    expect(code).not.toContain('function render');
    expect(code).not.toContain('ignored');
    expect(readSpecMaterialModule(code)).toEqual({ spec: GAUGE, renderBody: '' });
    const read = readTemplateMaterialModule(code);
    expect(read?.ok).toBe(true);

    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    const imported = await importSpecMaterialModule(code);
    expect(imported.ok).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
    createObjectURL.mockRestore();
  });

  it('keeps code materials on the render path', () => {
    const { template: _template, ...codeSpec } = GAUGE;
    const code = buildSpecMaterialModule(
      codeSpec as BaseScreenMaterialSpec,
      'root.textContent = "1";',
    );
    expect(code).toContain('export function render');
    expect(readTemplateMaterialModule(code)).toBeUndefined();
    expect(readSpecMaterialModule(code)?.renderBody).toBe('root.textContent = "1";');
  });

  it('fails closed when a template package carries an invalid template', () => {
    const code = buildSpecMaterialModule(brokenGauge() as BaseScreenMaterialSpec, '');
    expect(readTemplateMaterialModule(code)?.ok).toBe(false);
  });
});

describe('draftTemplateMaterialWithAgent', () => {
  function run(
    replies: readonly ({ ok: true; output: string } | { ok: false; message: string })[],
  ) {
    const requests: MaterialDraftAgentRequest[] = [];
    const progress: string[] = [];
    let call = 0;
    const outcome = draftTemplateMaterialWithAgent({
      instruction: '环形进度，超过 90 变红',
      type: TYPE,
      category: '在线组件',
      onProgress: ({ phase, round }) => progress.push(`${phase}:${round}`),
      request: async (body) => {
        requests.push(body);
        const next = replies[Math.min(call, replies.length - 1)];
        call += 1;
        return next as { ok: true; output: string } | { ok: false; message: string };
      },
    });
    return { outcome, requests, progress };
  }

  it('accepts a passing first draft and overrides the type the model wrote', async () => {
    const { outcome, requests, progress } = run([reply(GAUGE)]);
    const result = await outcome;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.type).toBe(TYPE);
    expect(result.repairRounds).toBe(0);
    expect(requests).toEqual([{ instruction: '环形进度，超过 90 变红' }]);
    expect(progress).toEqual(['drafting:0']);
  });

  it('tolerates a code fence and a bare spec without the wrapper', async () => {
    const fenced = { ok: true as const, output: `\`\`\`json\n${JSON.stringify(GAUGE)}\n\`\`\`` };
    expect((await run([fenced]).outcome).ok).toBe(true);
    expect((await run([reply(GAUGE, false)]).outcome).ok).toBe(true);
  });

  it('sends the previous output and spec-path findings back for repair', async () => {
    const broken = reply(brokenGauge());
    const { outcome, requests, progress } = run([broken, reply(GAUGE)]);
    const result = await outcome;
    expect(result.ok).toBe(true);
    expect(result.repairRounds).toBe(1);
    expect(progress).toEqual(['drafting:0', 'repairing:1']);
    const repair = requests[1]?.repair;
    expect(repair?.output).toBe(broken.output);
    expect(repair?.issues).toEqual([
      expect.objectContaining({
        rule: 'TPL2',
        path: expect.stringMatching(/^template\.nodes\[4\]/),
      }),
    ]);
  });

  it('stops early when a repair does not change the findings', async () => {
    const { outcome, requests } = run([reply(brokenGauge()), reply(brokenGauge())]);
    const result = await outcome;
    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(2);
    expect(result.ok ? '' : result.message).toContain('没有进展');
  });

  it('gives up after the repair limit without handing over a half-built spec', async () => {
    const { outcome, requests } = run([
      reply(brokenGauge('reading')),
      reply(brokenGauge('track')),
      reply(brokenGauge('fill')),
      reply(GAUGE),
    ]);
    const result = await outcome;
    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(MATERIAL_DRAFT_MAX_REPAIR_ROUNDS + 1);
    expect(result.repairRounds).toBe(MATERIAL_DRAFT_MAX_REPAIR_ROUNDS);
    expect(result.findings.some((item) => item.severity === 'error')).toBe(true);
    expect('spec' in result).toBe(false);
  });

  it('asks for repair when the output is not JSON or has no template', async () => {
    const { template: _template, ...codeSpec } = GAUGE;
    const { outcome, requests } = run([
      { ok: true, output: 'not json' },
      reply(codeSpec),
      reply(GAUGE),
    ]);
    expect((await outcome).ok).toBe(true);
    expect(requests[1]?.repair?.issues[0]?.rule).toBe('SPEC');
    expect(requests[2]?.repair?.issues[0]?.rule).toBe('TPL1');
  });

  it('reports a failed model call without findings', async () => {
    const result = await run([{ ok: false, message: '模型响应超时' }]).outcome;
    expect(result).toEqual({ ok: false, message: '模型响应超时', findings: [], repairRounds: 0 });
  });
});
