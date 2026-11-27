import { readFileSync } from 'node:fs';
import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compileStreamDelta,
  createHostIntentHandler,
  parseCanvasBackgroundInstruction,
} from '../../examples/vanilla-host/src/screen/host-intent';

/**
 * 宿主对「失败/被拒」的交代：一句原因 +（可选）一个能继续走的动作。
 *
 * 断言的是**交回引擎的契约**，不是 toast 文案：宿主不再自己弹浮层，
 * 提示只从书写面的常驻状态行出一次（见 DesignerIntentOutcome）。
 */

function document(): ScreenDocument {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

function componentDocument(): ScreenDocument {
  return {
    ...document(),
    components: [
      {
        id: 'title',
        type: 'base.text',
        name: '标题',
        parentId: null,
        position: { x: 40, y: 32 },
        size: { width: 320, height: 56 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        style: { color: '#ffffff', fontSize: 32 },
        dataSource: null,
        dataValue: { kind: 'inline', value: '旧标题' },
      },
    ],
  };
}

function designer(initial: ScreenDocument = document()) {
  const current = initial;
  const events = new EventTarget();
  return {
    addEventListener: vi.fn(events.addEventListener.bind(events)),
    removeEventListener: vi.fn(events.removeEventListener.bind(events)),
    dispatchEvent: events.dispatchEvent.bind(events),
    getDocument: vi.fn((): ScreenDocument | undefined => current),
    readPendingChange: vi.fn((): unknown => undefined),
    submitChangeProposal: vi.fn(() => ({ ok: true, diagnostics: [], value: {} })),
  };
}

const handler = (element = designer()) =>
  createHostIntentHandler({
    designer: element as unknown as BaseScreenDesignerElement,
    screenId: 'screen-test',
  });

const request = {
  instanceId: 'instance-test',
  text: '生成一张作战室',
  scope: { kind: 'screen' as const },
};

/**
 * 整屏生成的夹具（ADR-0113 §2.7）：后端只回模型原文，解析、编译、审计与修复回环都在宿主。
 * 目录用假的 `list()`，形状取自真实物料的最小子集；容器声明了 `children`，所以卡片与块会编成组合。
 */
function manifestOf(
  type: string,
  name: string,
  extra: Record<string, unknown> = {},
): { manifest: Record<string, unknown> } {
  return {
    manifest: {
      type,
      name,
      category: '基础',
      defaultSize: { width: 240, height: 120 },
      defaultProps: {},
      defaultStyle: {},
      styleSchema: { kind: 'object', properties: {}, required: [] },
      propsSchema: { kind: 'object', properties: {}, required: [] },
      dataCapabilities: [],
      designCapabilities: { resize: true, rotate: true },
      ...extra,
    },
  };
}

const GENERATION_CATALOG = {
  list: () => [
    manifestOf('base.text', '文本', {
      staticData: { kind: 'scalar' },
      defaultStyle: { color: '#e9eef5', fontSize: 20, fontWeight: '400' },
    }),
    manifestOf('base.rectangle', '矩形', {
      defaultStyle: { fill: '#141b24', borderRadius: 12 },
    }),
    manifestOf('base.chart', '图表', {
      category: '数据',
      staticData: { kind: 'tabular' },
      dataBinding: {
        roles: [
          { id: 'dimension', minFields: 1, maxFields: 1 },
          { id: 'measures', minFields: 1, maxFields: 8 },
        ],
      },
      defaultStyle: { backgroundColor: '#111827', color: '#f9fafb' },
    }),
    manifestOf('base.container', '容器', {
      libraryVisible: false,
      designCapabilities: { resize: true, rotate: true, children: true },
      defaultStyle: { fill: 'transparent', borderColor: 'transparent', borderWidth: 1 },
    }),
  ],
};

const generationHandler = (element = designer()) =>
  createHostIntentHandler({
    designer: element as unknown as BaseScreenDesignerElement,
    screenId: 'screen-test',
    catalog: () => GENERATION_CATALOG as never,
  });

const KPI = { label: '总量', value: 286000, unit: '件' };
const NOTE = { type: 'base.text', title: '要点', span: 2, text: '甲' };
const CHART_TABLE = {
  columns: [
    { id: 'day', label: '日期', type: 'string' },
    { id: 'amount', label: '金额', type: 'number' },
  ],
  rows: Array.from({ length: 10 }, (_, index) => ({ day: `d${index}`, amount: index })),
};

/** 模型原文：平铺写法，一条指标 + 一个文字块。 */
function output(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: '作战室',
    subtitle: '按日汇总的口径',
    kpis: [KPI],
    blocks: [NOTE],
    ...extra,
  });
}

/** 整屏作用域统一打 `/agent/act/stream`；这个 helper 给「路由判定为生成」的一次性响应。 */
function intentResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    kind: 'generate_screen',
    routedBy: 'rule',
    output: output(),
    mode: 'llm',
    catalogSource: 'client',
    assets: [],
    datasets: [],
    ...overrides,
  });
}

/** `/agent/candidate` 的修复响应：不带 kind / routedBy。 */
function repairResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    output: output(),
    mode: 'llm',
    catalogSource: 'client',
    assets: [],
    datasets: [],
    ...overrides,
  });
}

function sse(events: readonly (readonly [string, unknown])[]): Response {
  const body = events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

/** 六个纵向区域放不下：带指标带 + 5 个栅格区域。 */
type ProposalCommand = {
  type: string;
  component?: ScreenDocument['components'][number];
  patch?: unknown;
  componentIds?: string[];
};
type Proposal = { scope: string; rationale: string; commands: ProposalCommand[] };

const OVERFLOW = JSON.stringify({
  title: '作战室',
  subtitle: '按日汇总的口径',
  regions: [
    { kind: 'band', items: [KPI] },
    ...Array.from({ length: 5 }, (_, index) => ({
      kind: 'grid',
      blocks: [{ ...NOTE, title: `块${index}`, span: 4 }],
    })),
  ],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('host intent handler failure contract', () => {
  it('reports the transport error in the reason instead of only a toast', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'AGENT_UNAVAILABLE', message: '模型通道不可用。' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
      ),
    );

    const result = await handler()({
      instanceId: 'instance-test',
      text: '生成一张作战室',
      scope: { kind: 'screen' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('模型通道不可用。');
    // 传输失败没有「换个作用域就好了」这种补救，别给假出口。
    expect(result.remedy).toBeUndefined();
  });
});

describe('host intent component edits', () => {
  it('posts the selected component context and submits a bounded update proposal', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    const fetch = vi.fn(async () =>
      Response.json({
        summary: '标题已更新',
        patches: [{ componentId: 'title', text: '今晚开抢' }],
        mode: 'deterministic',
        failure: 'AGENT_NOT_CONFIGURED',
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const element = designer(componentDocument());
    const controller = new AbortController();

    const result = await handler(element)(
      {
        instanceId: 'instance-test',
        text: '把标题改成今晚开抢',
        scope: { kind: 'components', componentIds: ['title'] },
      },
      controller.signal,
    );

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('http://api.test/agent/edit', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: '把标题改成今晚开抢',
        components: [
          {
            id: 'title',
            type: 'base.text',
            name: '标题',
            props: {},
            style: { color: '#ffffff', fontSize: 32 },
            position: { x: 40, y: 32 },
            size: { width: 320, height: 56 },
            text: '旧标题',
          },
        ],
      }),
      signal: controller.signal,
    });
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.scope).toBe('标题');
    expect(proposal?.rationale).toContain('仅修改已选中的 1 个组件');
    expect(proposal?.commands).toEqual([
      {
        type: 'update-components',
        componentIds: ['title'],
        patch: {
          dataValue: { kind: 'inline', value: '今晚开抢' },
          dataSource: null,
        },
      },
    ]);
  });

  it('converts a legacy static text value to canonical inline data', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          summary: '标题已更新',
          patches: [{ componentId: 'title', text: '今晚开抢' }],
          mode: 'deterministic',
        }),
      ),
    );
    const legacy = componentDocument();
    legacy.components[0] = {
      ...legacy.components[0]!,
      dataSource: { type: 'static', value: '旧标题' },
      dataValue: null,
    };
    const element = designer(legacy);

    const result = await handler(element)({
      instanceId: 'instance-test',
      text: '把标题改成今晚开抢',
      scope: { kind: 'components', componentIds: ['title'] },
    });

    expect(result.ok).toBe(true);
    expect(element.submitChangeProposal.mock.calls[0]?.[0]?.commands).toEqual([
      {
        type: 'update-components',
        componentIds: ['title'],
        patch: {
          dataValue: { kind: 'inline', value: '今晚开抢' },
          dataSource: null,
        },
      },
    ]);
  });

  it('rejects patches that target anything outside the selected scope', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          summary: '越界修改',
          patches: [{ componentId: 'other', style: { color: '#ffffff' } }],
          mode: 'deterministic',
        }),
      ),
    );
    const element = designer(componentDocument());

    const result = await handler(element)({
      instanceId: 'instance-test',
      text: '改成白色',
      scope: { kind: 'components', componentIds: ['title'] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('不安全或不完整');
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });

  it('never replaces a data-bound text component with an inline value', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          summary: '错误地改成内联文本',
          patches: [{ componentId: 'title', text: '今晚开抢' }],
          mode: 'deterministic',
        }),
      ),
    );
    const bound = componentDocument();
    const component = bound.components[0]!;
    bound.components[0] = {
      ...component,
      dataValue: { kind: 'data-source-field', dataSourceId: 'metrics', path: ['title'] },
    };
    const element = designer(bound);

    const result = await handler(element)({
      instanceId: 'instance-test',
      text: '把标题改成今晚开抢',
      scope: { kind: 'components', componentIds: ['title'] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('不安全或不完整');
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });
});

describe('host intent canvas background', () => {
  it('turns a background-colour instruction into update-canvas, not a new screen', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const element = designer();

    const result = await handler(element)(
      { ...request, text: '把背景颜色改为天蓝色' },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    // 关键：不重新生成整屏，连模型都不调。
    expect(fetch).not.toHaveBeenCalled();
    expect(element.submitChangeProposal).toHaveBeenCalledOnce();
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.scope).toBe('画布背景');
    // 纯色同时落 `background`：渲染层渐变优先，只写 backgroundColor 会让旧渐变继续生效。
    expect(proposal?.commands).toEqual([
      {
        type: 'update-canvas',
        patch: { background: { type: 'solid', color: '#87ceeb' }, backgroundColor: '#87ceeb' },
      },
    ]);
  });

  it.each([
    ['把背景颜色改为天蓝色', '#87ceeb'],
    ['背景改成 #1e293b', '#1e293b'],
    ['把大屏背景换成深蓝色', '#16305c'],
    ['页面底色改为米色', '#f2ead8'],
    // 要动内容的一律放回整屏生成，不能被当成「只换底色」。
    ['生成一张天蓝色背景的销售大屏', null],
    ['把背景改成天蓝色，再加一个图表', null],
    ['把标题颜色改为蓝色', null],
  ])('parses canvas background from 「%s」', (text, expected) => {
    expect(parseCanvasBackgroundInstruction(text)).toBe(expected);
  });
});

describe('host intent canvas gradient', () => {
  const GRADIENT = {
    type: 'linear-gradient' as const,
    angle: 180,
    stops: [
      { color: '#87ceeb', position: 0 },
      { color: '#6fa9c1', position: 100 },
    ],
  };

  function gradientDocument(): ScreenDocument {
    return {
      ...document(),
      canvas: { width: 1920, height: 1080, backgroundColor: '#87ceeb', background: GRADIENT },
    };
  }

  it('forwards a gradient patch from the router instead of dropping it', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    const fetchMock = vi.fn(async () =>
      Response.json({ kind: 'set_canvas', routedBy: 'rule', patch: { background: GRADIENT } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const element = designer();

    // 渐变的派生在后端规则里，本地规则只认纯色，所以这句会走到 /agent/act。
    const result = await handler(element)({ ...request, text: '把背景改成渐变的天蓝色' });

    expect(result.ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.commands).toEqual([
      { type: 'update-canvas', patch: { background: GRADIENT } },
    ]);
  });

  it('sends the current fill so the backend can tell a no-op', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    const fetchMock = vi.fn(async () =>
      Response.json({ kind: 'set_canvas', routedBy: 'rule', patch: { background: GRADIENT } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await handler(designer(gradientDocument()))({ ...request, text: '把背景改成渐变的深蓝色' });

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string } | undefined)?.body),
    ) as { canvas?: { background?: unknown } };
    expect(body.canvas?.background).toEqual(GRADIENT);
  });

  it('turns an existing gradient back into the requested solid colour', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const element = designer(gradientDocument());

    const result = await handler(element)({ ...request, text: '背景换成白色' });

    expect(result.ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    // 关键：渐变不会自己消失，必须同时把它收成 solid，否则用户看到"改了没反应"。
    expect(proposal?.commands).toEqual([
      {
        type: 'update-canvas',
        patch: { background: { type: 'solid', color: '#ffffff' }, backgroundColor: '#ffffff' },
      },
    ]);
  });

  it('rejects a malformed gradient instead of claiming nothing changed', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          kind: 'set_canvas',
          routedBy: 'model',
          patch: {
            background: {
              type: 'linear-gradient',
              angle: 180,
              stops: [
                { color: '#87ceeb', position: 60 },
                { color: '#fff', position: 20 },
              ],
            },
          },
        }),
      ),
    );
    const element = designer();

    const result = await handler(element)({ ...request, text: '背景做成蓝色渐变' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('不合法');
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });
});

describe('host intent action routing', () => {
  it('turns a set_canvas action into an update-canvas proposal', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          kind: 'set_canvas',
          routedBy: 'model',
          patch: { backgroundColor: '#16305c' },
        }),
      ),
    );
    const element = designer();

    // 这句不走本地规则（不是「背景改为 X」的句式），必须由后端路由判定。
    const result = await handler(element)({ ...request, text: '帮我弄个清爽点的底色' });

    expect(result.ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.scope).toBe('画布');
    expect(proposal?.commands).toEqual([
      {
        type: 'update-canvas',
        patch: { background: { type: 'solid', color: '#16305c' }, backgroundColor: '#16305c' },
      },
    ]);
  });

  it('reports the unsupported reason from the router', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          kind: 'unsupported',
          routedBy: 'model',
          reason: 'missing_reference',
          suggestion: '先选中要改的组件',
        }),
      ),
    );
    const element = designer();

    const result = await handler(element)({ ...request, text: '把那个再大一点' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('先选中要改的组件');
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });
});

describe('host intent whole-screen generation (ADR-0113 §2.7)', () => {
  const stubFetch = (...responses: Response[]) => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    // 每次都交出一份克隆：原件的响应体不会被读掉，最后一份可以无限重复。
    let call = 0;
    const fetch = vi.fn(async () => {
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return (response as Response).clone();
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };

  it('routes the screen scope through /agent/act/stream, compiles locally and submits an unsaved proposal', async () => {
    const fetch = stubFetch(intentResponse());
    const element = designer();
    const before = element.getDocument();

    expect((await generationHandler(element)(request, new AbortController().signal)).ok).toBe(true);
    // 不再直接打 /agent/candidate；动作由后端判定，整屏作用域按 SSE 请求，后端回普通 JSON 时照常读。
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe('http://api.test/agent/act/stream');
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ text: request.text, scope: 'screen', screenId: 'screen-test' });
    // 目录随请求带来，容器带 children 标记（外壳），但不会出现在模型可挑的类型里（后端提示词不列）。
    expect(body.catalog.materials.map((item: { type: string }) => item.type)).toContain(
      'base.container',
    );
    expect(element.submitChangeProposal).toHaveBeenCalledOnce();
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.scope).toBe('整屏');
    expect(
      proposal?.commands.some((command: { type: string }) => command.type === 'add-component'),
    ).toBe(true);
    // 候选只是提案，文档本身没动。
    expect(element.getDocument()).toBe(before);
  });

  it('compiles cards and blocks into movable groups when the catalog has a shell', async () => {
    stubFetch(intentResponse());
    const element = designer();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    const commands = (element.submitChangeProposal.mock.calls[0]?.[0]?.commands ?? []) as {
      type: string;
      component?: { type: string; parentId: string | null };
    }[];
    const added = commands.filter((command) => command.type === 'add-component');
    expect(added.some((command) => command.component?.type === 'base.container')).toBe(true);
    expect(added.some((command) => command.component?.parentId !== null)).toBe(true);
  });

  it.each(['abort', 'document', 'undo', 'unload', 'pending'] as const)(
    'does not submit a late successful response after %s',
    async (change) => {
      vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
      let finish!: (response: Response) => void;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve;
            }),
        ),
      );
      const element = designer();
      const controller = new AbortController();
      const result = generationHandler(element)(request, controller.signal);
      if (change === 'abort') controller.abort();
      if (change === 'document') element.getDocument.mockReturnValue(document());
      if (change === 'undo') element.dispatchEvent(new Event('base-screen-change'));
      if (change === 'unload') element.getDocument.mockReturnValue(undefined);
      if (change === 'pending') element.readPendingChange.mockReturnValue({ id: 'existing' });
      finish(intentResponse());

      expect((await result).ok).toBe(false);
      expect(element.submitChangeProposal).not.toHaveBeenCalled();
      expect(element.removeEventListener).toHaveBeenCalledWith(
        'base-screen-change',
        element.addEventListener.mock.calls[0]?.[1],
      );
    },
  );

  it.each(['abort', 'unloaded', 'pending'] as const)(
    'refuses %s before dispatch',
    async (state) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const element = designer();
      const controller = new AbortController();
      if (state === 'abort') controller.abort();
      if (state === 'unloaded') element.getDocument.mockReturnValue(undefined);
      if (state === 'pending') element.readPendingChange.mockReturnValue({ id: 'existing' });

      expect((await generationHandler(element)(request, controller.signal)).ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      expect(element.submitChangeProposal).not.toHaveBeenCalled();
    },
  );

  it('refuses to generate without the designer catalog instead of guessing one', async () => {
    const fetch = stubFetch(intentResponse());
    const element = designer();

    const result = await handler(element)(request);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('物料目录');
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
    void fetch;
  });

  it('never submits a whole-screen proposal built from an empty output', async () => {
    stubFetch(intentResponse({ output: '{}' }));
    const element = designer();

    const result = await generationHandler(element)(request);

    expect(result.ok).toBe(false);
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });

  it('rejects an unparseable output after asking for a repair once, without submitting it', async () => {
    const fetch = stubFetch(intentResponse({ output: '这不是 JSON' }));
    const element = designer();

    const result = await generationHandler(element)(request);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('无法整理成大屏');
    // 同一组诊断连续两轮不变就提前停：一次修复请求后原地打转，不再请求。
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });

  it('explains why the deterministic fallback ran in the proposal rationale', async () => {
    stubFetch(
      intentResponse({
        mode: 'deterministic',
        failure: 'AGENT_NOT_CONFIGURED',
        output: output({ kpis: [{ label: '总量', value: null }] }),
      }),
    );
    const element = designer();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.title).toBe('智能体 · 生成一张作战室');
    expect(proposal?.origin).toEqual({ author: '智能体' });
    expect(proposal?.rationale).toContain('未配置模型');
    expect(proposal?.rationale).not.toContain('AGENT_NOT_CONFIGURED');
  });

  it('names the degradation in the proposal rationale', async () => {
    stubFetch(
      intentResponse({
        output: output({
          blocks: [{ type: 'base.chart', title: '趋势', span: 4, table: CHART_TABLE }],
        }),
      }),
    );
    const element = designer();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.rationale).toContain('有 1 处降级：表格超过 8 行，已裁剪');
  });

  it('says what the model substituted for what the user asked for', async () => {
    stubFetch(
      intentResponse({
        output: output({
          blocks: [
            {
              type: 'base.chart',
              title: '门店排行',
              span: 4,
              substituteFor: '全国门店分布地图',
              table: { ...CHART_TABLE, rows: CHART_TABLE.rows.slice(0, 4) },
            },
          ],
        }),
      }),
    );
    const element = designer();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    expect(element.submitChangeProposal.mock.calls[0]?.[0]?.rationale).toContain(
      '你要的「全国门店分布地图」目录里没有，已用「图表」代替',
    );
  });

  it('reports the failure even when the model still produced a screen', async () => {
    stubFetch(intentResponse({ failure: 'AGENT_SPEC_INVALID' }));
    const element = designer();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    // 有产出不等于没出问题：failure 必须出现在理由里，而不是被「由模型生成」盖过去。
    expect(element.submitChangeProposal.mock.calls[0]?.[0]?.rationale).toContain(
      '模型输出未通过校验',
    );
  });

  describe('repair loop (ADR-0112 §2.1, driven by the host)', () => {
    const BAD_KPI = output({ kpis: [KPI, { label: '坏', value: '28.6 万' }] });

    it('asks for a repair with model paths when an item is unusable, then submits the repaired output', async () => {
      const fetch = stubFetch(intentResponse({ output: BAD_KPI }), repairResponse());
      const element = designer();

      const result = await generationHandler(element)(request);

      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[1]?.[0]).toBe('http://api.test/agent/candidate');
      const body = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
      expect(body.repair).toEqual({
        output: BAD_KPI,
        issues: [{ code: 'AGENT_KPI_INVALID', path: 'kpis[1]' }],
      });
      // 没修好的那份从未进草案：只提交了修复后的一份，理由里写明修复过。
      expect(element.submitChangeProposal).toHaveBeenCalledOnce();
      expect(element.submitChangeProposal.mock.calls[0]?.[0]?.rationale).toContain(
        '已请模型修复 1 次',
      );
    });

    it('asks for a repair when the layout does not fit, naming the capacity conflict', async () => {
      const fetch = stubFetch(intentResponse({ output: OVERFLOW }), repairResponse());
      const element = designer();

      expect((await generationHandler(element)(request)).ok).toBe(true);
      const body = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
      expect(body.repair.issues).toEqual([
        { code: 'LAYOUT_CAPACITY_EXCEEDED', path: expect.stringMatching(/^regions\[\d\]$/) },
      ]);
    });

    it('stops when the same diagnostics come back, and delivers the usable rest with an honest note', async () => {
      const fetch = stubFetch(intentResponse({ output: BAD_KPI }));
      const element = designer();

      const result = await generationHandler(element)(request);

      // 一次修复后诊断没变：不再请求；问题只在个别指标上，去掉那一项、其余照常交出。
      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
      const rationale = element.submitChangeProposal.mock.calls[0]?.[0]?.rationale as string;
      expect(rationale).toContain('有 1 处降级：有指标数值不合格，已去掉');
      expect(rationale).not.toContain('有模块经修复仍不可用');
    });

    it('adds a summary line when whole blocks were dropped, listing each reason', async () => {
      const dropped = output({
        blocks: [NOTE, { type: 'no.such.material', title: '没有的组件', span: 2 }],
      });
      stubFetch(intentResponse({ output: dropped }));
      const element = designer();

      expect((await generationHandler(element)(request)).ok).toBe(true);
      const rationale = element.submitChangeProposal.mock.calls[0]?.[0]?.rationale as string;
      expect(rationale).toContain('有 2 处降级');
      expect(rationale).toContain('有模块用了目录里没有的组件，已跳过');
    });

    describe('sample check before the proposal (ADR-0114 D6)', () => {
      const WITH_DATASET = output({
        blocks: [NOTE, { type: 'base.chart', title: '订单', span: 2, datasetId: 'orders' }],
      });
      const ORDERS = {
        datasetId: 'orders',
        name: '订单',
        columns: [
          { id: 'day', type: 'string' },
          { id: 'amount', type: 'number' },
        ],
        parameters: [{ name: 'limit', required: false, defaultValue: 6 }],
      };
      const fields = [
        { id: 'day', label: '日期', valueType: 'string' as const },
        { id: 'amount', label: '金额', valueType: 'number' as const },
      ];
      const portOf = (rows: Record<string, unknown>[] | 'fail', queries: unknown[] = []) => ({
        list: async () => ({ ok: true as const, value: { items: [] }, diagnostics: [] }),
        describe: async () => ({ ok: false as const, diagnostics: [] }),
        query: async (requested: unknown) => {
          queries.push(requested);
          if (rows === 'fail') throw new Error('down');
          return { ok: true as const, value: { fields, rows }, diagnostics: [] };
        },
      });
      const handlerWith = (element: ReturnType<typeof designer>, port: unknown) =>
        createHostIntentHandler({
          designer: element as unknown as BaseScreenDesignerElement,
          screenId: 'screen-test',
          catalog: () => GENERATION_CATALOG as never,
          datasetPort: port as never,
        });

      it('asks for a repair when a bound dataset comes back empty, naming the block', async () => {
        const fetch = stubFetch(
          intentResponse({ output: WITH_DATASET, datasets: [ORDERS] }),
          repairResponse(),
        );
        const queries: unknown[] = [];
        const element = designer();

        const result = await handlerWith(element, portOf([], queries))(request);

        expect(result.ok).toBe(true);
        expect(queries).toEqual([
          { datasetId: 'orders', dataSourceId: 'agent-check-1', params: { limit: 6 } },
        ]);
        const body = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
        expect(body.repair.issues).toEqual([{ code: 'DATA_RESULT_EMPTY', path: 'blocks[1]' }]);
        expect(element.submitChangeProposal).toHaveBeenCalledOnce();
      });

      it('submits with a note when the bound data checks out', async () => {
        stubFetch(intentResponse({ output: WITH_DATASET, datasets: [ORDERS] }));
        const element = designer();

        const result = await handlerWith(element, portOf([{ day: 'd1', amount: 3 }]))(request);

        expect(result.ok).toBe(true);
        const rationale = element.submitChangeProposal.mock.calls[0]?.[0]?.rationale as string;
        expect(rationale).toContain('将接入的数据：订单（limit=6）');
        expect(rationale).toContain('已用样例查询核对 1 个数据源');
      });

      it('does not blame the model when the sample query itself fails', async () => {
        const fetch = stubFetch(intentResponse({ output: WITH_DATASET, datasets: [ORDERS] }));
        const element = designer();

        const result = await handlerWith(element, portOf('fail'))(request);

        expect(result.ok).toBe(true);
        expect(fetch).toHaveBeenCalledOnce();
        const rationale = element.submitChangeProposal.mock.calls[0]?.[0]?.rationale as string;
        expect(rationale).toContain('「订单」样例查询失败，未验证');
      });
    });

    it('gives up after two repair rounds when the output keeps changing but stays unusable', async () => {
      const fetch = stubFetch(
        intentResponse({ output: OVERFLOW }),
        repairResponse({ output: '这不是 JSON' }),
        repairResponse({ output: JSON.stringify({ title: '无', subtitle: '无' }) }),
      );
      const element = designer();

      const result = await generationHandler(element)(request);

      expect(result.ok).toBe(false);
      // 首次 + 两轮修复，总共三次模型调用，不会有第四次。
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(element.submitChangeProposal).not.toHaveBeenCalled();
    });

    it('does not ask the model to repair proposal-state rejections', async () => {
      const fetch = stubFetch(intentResponse());
      const element = designer();
      element.submitChangeProposal.mockReturnValue({
        ok: false,
        diagnostics: [
          { severity: 'error', code: 'CHANGE_DRAFT_PENDING', path: [], message: 'pending' },
        ],
        value: {},
      } as never);

      const result = await generationHandler(element)(request);

      expect(result.ok).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('reports a repair transport failure instead of claiming success', async () => {
      stubFetch(
        intentResponse({ output: BAD_KPI }),
        Response.json(
          { error: 'AGENT_TIMEOUT', message: '模型响应超时，请稍后重试。' },
          { status: 504 },
        ),
      );
      const element = designer();

      const result = await generationHandler(element)(request);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.reason).toBe('模型响应超时，请稍后重试。');
      expect(element.submitChangeProposal).not.toHaveBeenCalled();
    });
  });

  it('reports engine rejection without claiming success', async () => {
    stubFetch(intentResponse());
    const element = designer();
    element.submitChangeProposal.mockReturnValue({ ok: false, diagnostics: [], value: {} });

    const result = await generationHandler(element)(request);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('引擎拒绝');
  });

  describe('locked backdrop kept under the new screen', () => {
    /** 一块锁定的整屏底板：整屏替换不删它，新内容叠在它上面。 */
    function lockedBackdrop(fill: string): ScreenDocument {
      const [base] = componentDocument().components;
      if (base === undefined) throw new Error('fixture');
      return {
        ...document(),
        components: [
          {
            ...base,
            id: 'stage-bg',
            type: 'base.rectangle',
            name: '背景',
            position: { x: 0, y: 0 },
            size: { width: 1920, height: 1080 },
            zIndex: 1,
            status: { locked: true, hidden: false },
            props: {},
            style: { fill, opacity: 1 },
            dataValue: null,
          },
        ],
      } as ScreenDocument;
    }
    const lightOutput = output({ style: 'light-biz' });

    it('asks the model to switch to a dark style when a light screen would sit on a locked dark backdrop', async () => {
      const fetch = stubFetch(
        intentResponse({ output: lightOutput }),
        repairResponse({ output: output({ style: 'deep-tech' }) }),
      );
      const element = designer(lockedBackdrop('#0b1020'));

      const outcome = await generationHandler(element)(request);

      expect(outcome.ok).toBe(true);
      const body = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
      expect(body.repair.issues).toEqual([{ code: 'LAYOUT_LOCKED_BACKDROP_DARK', path: '' }]);
      expect(element.submitChangeProposal).toHaveBeenCalledOnce();
      // 用户说的是浅色、交出的是深色：理由里要讲清楚为什么，以及想要浅色该怎么做。
      const rationale = element.submitChangeProposal.mock.calls[0]?.[0]?.rationale as string;
      expect(rationale).toContain('已改用深色风格');
      expect(rationale).toContain('解锁或删除这个背景');
    });

    it('says what to do when the model keeps the clashing style', async () => {
      stubFetch(intentResponse({ output: lightOutput }));
      const element = designer(lockedBackdrop('#0b1020'));

      const outcome = await generationHandler(element)(request);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('unreachable');
      expect(outcome.reason).toContain('锁定保留的深色背景');
      expect(outcome.reason).toContain('解锁');
      expect(element.submitChangeProposal).not.toHaveBeenCalled();
    });

    it('lets a dark screen through over the same dark backdrop', async () => {
      const fetch = stubFetch(intentResponse({ output: output({ style: 'deep-tech' }) }));
      const element = designer(lockedBackdrop('#0b1020'));

      expect((await generationHandler(element)(request)).ok).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('names a light backdrop as light', async () => {
      const fetch = stubFetch(
        intentResponse({ output: output({ style: 'deep-tech' }) }),
        repairResponse({ output: lightOutput }),
      );
      const element = designer(lockedBackdrop('#f4f6fa'));

      await generationHandler(element)(request);

      const body = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
      expect(body.repair.issues).toEqual([{ code: 'LAYOUT_LOCKED_BACKDROP_LIGHT', path: '' }]);
    });
  });

  it('clears the old gradient and background image, which would otherwise cover the new palette', async () => {
    stubFetch(intentResponse());
    const current: ScreenDocument = {
      ...componentDocument(),
      canvas: {
        ...document().canvas,
        background: {
          type: 'linear-gradient',
          angle: 180,
          stops: [
            { color: '#0b1020', position: 0 },
            { color: '#1e293b', position: 100 },
          ],
        },
        backgroundImage: 'https://example.com/bg.png',
        backgroundImageFit: 'cover',
      } as ScreenDocument['canvas'],
    };
    const element = designer(current);

    expect((await generationHandler(element)(request)).ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0] as unknown as Proposal;
    const canvas = proposal.commands.find((command) => command.type === 'update-canvas') as
      | { patch: Record<string, unknown> }
      | undefined;
    expect(canvas?.patch).toMatchObject({
      background: null,
      backgroundImage: null,
      backgroundImageFit: null,
    });
  });

  it('leaves the canvas fill alone when there is no gradient or image to clear', async () => {
    stubFetch(intentResponse());
    const element = designer();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0] as unknown as Proposal;
    const canvas = proposal.commands.find((command) => command.type === 'update-canvas') as
      | { patch: Record<string, unknown> }
      | undefined;
    expect(canvas?.patch).not.toHaveProperty('background');
    expect(canvas?.patch).not.toHaveProperty('backgroundImage');
  });

  it('clears the old blueprint before removing the components it references', async () => {
    stubFetch(intentResponse());
    const current: ScreenDocument = {
      ...componentDocument(),
      blueprint: {
        nodes: [{ id: 'node-1', componentId: 'title' }],
        edges: [],
      } as unknown as ScreenDocument['blueprint'],
    };
    const element = designer(current);

    expect((await generationHandler(element)(request)).ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0] as
      | { commands: { type: string; blueprint?: unknown }[] }
      | undefined;
    const types = (proposal?.commands ?? []).map((command) => command.type);
    // 蓝图节点引用组件：先清空蓝图再删组件，否则删除那一步因悬空引用被拒。
    expect(types.indexOf('replace-blueprint')).toBeGreaterThan(-1);
    expect(types.indexOf('replace-blueprint')).toBeLessThan(types.indexOf('remove-components'));
    expect(
      proposal?.commands.find((command) => command.type === 'replace-blueprint'),
    ).toMatchObject({
      blueprint: { nodes: [], edges: [] },
    });
  });
});

describe('host intent partial edits on the held screen (ADR-0113 §2.5)', () => {
  const editResponse = (overrides: Record<string, unknown> = {}) =>
    Response.json({
      kind: 'edit_screen',
      routedBy: 'rule',
      summary: '把要点改成库存紧张',
      ops: [{ op: 'change', target: 'blocks[0]', set: { text: '库存紧张' } }],
      mode: 'llm',
      ...overrides,
    });

  function stubSequence(...responses: Response[]) {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    let call = 0;
    const fetch = vi.fn(async () => {
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return (response as Response).clone();
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  /** 用户采纳了整屏提案：活文档就是提案里加进来的那些组件。 */
  function adopt(element: ReturnType<typeof designer>, proposal: Proposal): ScreenDocument {
    const canvas = proposal.commands.find((command) => command.type === 'update-canvas') as
      | { patch: Partial<ScreenDocument['canvas']> }
      | undefined;
    const adopted: ScreenDocument = {
      ...document(),
      canvas: { ...document().canvas, ...canvas?.patch },
      components: proposal.commands.flatMap((command) =>
        command.type === 'add-component' && command.component !== undefined
          ? [command.component]
          : [],
      ),
    };
    element.getDocument.mockReturnValue(adopted);
    return adopted;
  }

  /** 先整屏生成一次并采纳，再让下一次请求进来。返回替身与 fetch。 */
  async function generated(...next: Response[]) {
    const fetch = stubSequence(intentResponse(), ...next);
    const element = designer();
    const run = generationHandler(element);
    expect((await run(request)).ok).toBe(true);
    const first = element.submitChangeProposal.mock.calls[0]?.[0] as unknown as Proposal;
    const adopted = adopt(element, first);
    return { fetch, element, run, adopted };
  }

  const second = {
    instanceId: 'instance-test',
    text: '把要点改成库存紧张',
    scope: { kind: 'screen' as const },
  };

  it('sends the target list of the held screen, then submits only the components that changed', async () => {
    const { fetch, element, run } = await generated(editResponse());

    const outcome = await run(second);

    expect(outcome.ok).toBe(true);
    const body = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
    expect(body.session).toMatchObject({
      title: '作战室',
      regions: [
        { path: 'kpis', kind: 'band', items: [{ target: 'kpis[0]', kind: 'kpi', title: '总量' }] },
        {
          path: 'blocks',
          kind: 'grid',
          items: [{ target: 'blocks[0]', kind: 'block', type: 'base.text' }],
        },
      ],
    });
    const proposal = element.submitChangeProposal.mock.calls[1]?.[0] as unknown as Proposal;
    expect(proposal.scope).toBe('局部修改');
    expect(proposal.commands.map((command) => command.type)).toEqual(['update-components']);
    expect(JSON.stringify(proposal.commands[0]?.patch)).toContain('库存紧张');
    expect(proposal.rationale).toContain('其余组件保持原样');
    expect(proposal.rationale).toContain('更新 1 个组件');
  });

  it('keeps going across rounds: the edited screen is the held one for the next edit', async () => {
    const { element, run } = await generated(
      editResponse(),
      editResponse({ ops: [{ op: 'change', target: 'blocks[0]', set: { text: '第三版' } }] }),
    );

    expect((await run(second)).ok).toBe(true);
    const edit = element.submitChangeProposal.mock.calls[1]?.[0] as unknown as Proposal;
    // 用户采纳了局部修改：把 update 命令套到活文档上。
    const live = element.getDocument() as ScreenDocument;
    const update = edit.commands[0] as { componentIds: string[]; patch: Record<string, unknown> };
    element.getDocument.mockReturnValue({
      ...live,
      components: live.components.map((component) =>
        update.componentIds.includes(component.id) ? { ...component, ...update.patch } : component,
      ),
    } as ScreenDocument);

    expect((await run({ ...second, text: '再改一次' })).ok).toBe(true);
    const third = element.submitChangeProposal.mock.calls[2]?.[0] as unknown as Proposal;
    expect(third.commands.map((command) => command.type)).toEqual(['update-components']);
    expect(third.rationale).not.toContain('手动改过');
  });

  it('does not offer a session when the screen on the canvas is not the generated one', async () => {
    const { fetch, element, run } = await generated(editResponse());
    element.getDocument.mockReturnValue(componentDocument());

    await run(second);

    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).not.toHaveProperty('session');
  });

  it('does not offer a session before the first proposal was adopted', async () => {
    const fetch = stubSequence(intentResponse(), editResponse());
    const element = designer();
    const run = generationHandler(element);
    expect((await run(request)).ok).toBe(true);

    await run(second);

    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).not.toHaveProperty('session');
  });

  it('leaves a component the user edited by hand alone and says so', async () => {
    const { element, run, adopted } = await generated(editResponse());
    const body = adopted.components.find(
      (component) => component.dataValue?.kind === 'inline' && component.dataValue.value === '甲',
    );
    if (body === undefined) throw new Error('fixture: block body');
    element.getDocument.mockReturnValue({
      ...adopted,
      components: adopted.components.map((component) =>
        component.id === body.id
          ? { ...component, dataValue: { kind: 'inline', value: '我自己写的' } }
          : component,
      ),
    } as ScreenDocument);

    const outcome = await run(second);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.reason).toContain('手动改过');
    expect(element.submitChangeProposal).toHaveBeenCalledTimes(1);
  });

  it('reports an operation that cannot be applied, and changes nothing', async () => {
    const { element, run } = await generated(
      editResponse({ ops: [{ op: 'delete', target: 'blocks[7]' }] }),
    );

    const outcome = await run(second);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.reason).toContain('找不到');
    expect(element.submitChangeProposal).toHaveBeenCalledTimes(1);
  });

  it('passes the model’s “cannot do that” through instead of guessing', async () => {
    const { run } = await generated(
      editResponse({ ops: [], unsupported: '目录里没有地图组件，可以先用图表代替' }),
    );

    const outcome = await run(second);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.reason).toBe('目录里没有地图组件，可以先用图表代替');
  });

  it('explains an empty edit caused by a missing model instead of failing silently', async () => {
    const { run } = await generated(editResponse({ ops: [], failure: 'AGENT_NOT_CONFIGURED' }));

    const outcome = await run(second);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.reason).toContain('未配置模型');
  });
});

describe('host intent streamed generation (ADR-0112 §2.5 / ADR-0113 §2.8)', () => {
  const skeletonEvent = {
    title: '作战室',
    subtitle: '按日汇总的口径',
    layout: { kpis: 1, blocks: [{ type: 'base.text', span: 2 }] },
  };
  const resultEvent = (overrides: Record<string, unknown> = {}) => ({
    kind: 'generate_screen',
    routedBy: 'rule',
    output: output(),
    mode: 'llm',
    catalogSource: 'client',
    assets: [],
    datasets: [],
    ...overrides,
  });

  /** 带流式草案接口的设计器替身：待决提案由它自己记，状态变化时发引擎同名事件。 */
  function streamingDesigner(options: { readonly cancelAfterBegin?: boolean } = {}) {
    const element = designer();
    let pending: { id: string; streaming?: true } | undefined;
    const notify = () => element.dispatchEvent(new Event('base-screen-change-state'));
    const ok = { ok: true, diagnostics: [], value: { id: 'change-1' } };
    return Object.assign(element, {
      readPendingChange: vi.fn(() => pending),
      beginChangeProposal: vi.fn(() => {
        pending = { id: 'change-1', streaming: true };
        notify();
        // 用户在骨架挂出后点「取消生成」：引擎撤掉草案并发状态事件。
        if (options.cancelAfterBegin === true) setTimeout(() => element.discardPendingChange(), 0);
        return ok;
      }),
      extendChangeProposal: vi.fn(() => ok),
      finishChangeProposal: vi.fn(() => {
        pending = { id: 'change-1' };
        notify();
        return ok;
      }),
      discardPendingChange: vi.fn(() => {
        pending = undefined;
        notify();
      }),
    });
  }

  const stubStream = (events: readonly (readonly [string, unknown])[]) => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sse(events)),
    );
  };

  it('mounts the skeleton, appends deltas and finishes in place instead of resubmitting', async () => {
    stubStream([
      ['status', { phase: 'thinking' }],
      ['status', { phase: 'writing' }],
      ['skeleton', skeletonEvent],
      ['item', { path: 'kpis[0]', value: KPI }],
      ['item', { path: 'blocks[0]', value: NOTE }],
      ['result', resultEvent()],
    ]);
    const element = streamingDesigner();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    expect(element.beginChangeProposal).toHaveBeenCalledOnce();
    expect(element.beginChangeProposal.mock.calls[0]?.[0]).toMatchObject({ scope: '整屏' });
    // 骨架先行：两项内容各补一帧，已有组件不动（占位框被内容换掉）。
    expect(element.extendChangeProposal).toHaveBeenCalledTimes(2);
    expect(element.finishChangeProposal).toHaveBeenCalledExactlyOnceWith('change-1', {
      rationale: expect.stringContaining('由模型生成'),
    });
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
    expect(element.discardPendingChange).not.toHaveBeenCalled();
  });

  it('does not stream a skeleton the catalog cannot lay out', async () => {
    stubStream([
      [
        'skeleton',
        { ...skeletonEvent, layout: { kpis: 1, blocks: [{ type: 'no.such', span: 2 }] } },
      ],
      ['result', resultEvent()],
    ]);
    const element = streamingDesigner();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    // 骨架不合法就不挂草案，等整份结果到了整屏提交。
    expect(element.beginChangeProposal).not.toHaveBeenCalled();
    expect(element.submitChangeProposal).toHaveBeenCalledOnce();
  });

  it('replaces the streamed draft when the final output moved a streamed component', async () => {
    // 最终结果的指标比骨架多一条：指标卡变窄，已出现的组件几何变了，草案接不上。
    stubStream([
      ['skeleton', skeletonEvent],
      ['item', { path: 'kpis[0]', value: KPI }],
      [
        'result',
        resultEvent({
          output: output({ kpis: [KPI, { label: '周转', value: 31.4, unit: '天' }] }),
        }),
      ],
    ]);
    const element = streamingDesigner();

    expect((await generationHandler(element)(request)).ok).toBe(true);
    expect(element.finishChangeProposal).not.toHaveBeenCalled();
    expect(element.discardPendingChange).toHaveBeenCalledOnce();
    expect(element.submitChangeProposal).toHaveBeenCalledOnce();
  });

  it('aborts the request and submits nothing when the user cancels the generating draft', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
        const head = `event: skeleton\ndata: ${JSON.stringify(skeletonEvent)}\n\n`;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(head));
            init.signal.addEventListener('abort', () =>
              controller.error(new DOMException('aborted', 'AbortError')),
            );
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }),
    );
    const element = streamingDesigner({ cancelAfterBegin: true });

    const outcome = await generationHandler(element)(request);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.reason).toContain('已取消生成');
    expect(element.finishChangeProposal).not.toHaveBeenCalled();
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });

  function text(id: string, x: number, value: string, y = 32) {
    const [base] = componentDocument().components;
    if (base === undefined) throw new Error('fixture');
    return {
      ...base,
      id,
      name: id,
      position: { x, y },
      dataValue: { kind: 'inline' as const, value },
    };
  }
  const skeleton = (): ScreenDocument => ({
    ...document(),
    components: [text('agent-title-0', 40, '作战室'), text('agent-block-0-pending', 400, '·', 200)],
  });
  const filled = (): ScreenDocument => ({
    ...document(),
    components: [text('agent-title-0', 40, '作战室'), text('agent-block-0-0', 400, '要点', 200)],
  });

  it('builds frame deltas only when every shared component is unchanged', () => {
    const current = document();
    expect(compileStreamDelta(current, skeleton(), filled())).toEqual([
      { type: 'remove-components', componentIds: ['agent-block-0-pending'] },
      { type: 'add-component', component: expect.objectContaining({ id: 'agent-block-0-0' }) },
    ]);
    expect(compileStreamDelta(current, filled(), filled())).toEqual([]);
    const retitled = filled();
    const changed = {
      ...retitled,
      components: retitled.components.map((node) =>
        node.id === 'agent-title-0' ? { ...node, name: '换了' } : node,
      ),
    };
    expect(compileStreamDelta(current, filled(), changed)).toBeUndefined();
    expect(
      compileStreamDelta(current, filled(), {
        ...filled(),
        canvas: { ...filled().canvas, backgroundColor: '#111111' },
      }),
    ).toBeUndefined();
  });
});

const HOSTS = ['vanilla-host', 'react-host', 'vue-host'] as const;
const EDITORS = {
  'vanilla-host': 'examples/vanilla-host/src/views/screen-edit.ts',
  'react-host': 'examples/react-host/src/components/screen-editor.tsx',
  'vue-host': 'examples/vue-host/src/components/ScreenEditor.vue',
} as const;
const COMPOSITION_RUNTIMES = {
  'react-host': 'examples/react-host/src/screen/composition-runtime.ts',
  'vue-host': 'examples/vue-host/src/screen/composition-runtime.ts',
} as const;

/**
 * 三端的书写面必须逐字对等：适配器只有一份（模型调用、文档校验、提案编译都在里面），
 * 差异只允许出现在框架的挂载/卸载写法上。少一处接线时列表里仍能看到智能体生成的屏，
 * 只有设计器右栏退回「当前环境未接入智能体」——这种半接线状态最容易被当成环境问题。
 */
describe('host intent wiring parity', () => {
  it('keeps one intent adapter across hosts', () => {
    const baseline = readFileSync(`examples/${HOSTS[0]}/src/screen/host-intent.ts`, 'utf8');
    for (const host of HOSTS.slice(1)) {
      expect(
        readFileSync(`examples/${host}/src/screen/host-intent.ts`, 'utf8'),
        `${host}/src/screen/host-intent.ts 必须与 vanilla 逐字一致`,
      ).toBe(baseline);
    }
  });

  it('binds the handler after load and unbinds it on teardown in every host', () => {
    for (const host of HOSTS) {
      const source = readFileSync(EDITORS[host], 'utf8');
      // 三端的绑定写法现在带目录读取函数，断言按结构匹配而不是逐字抄整行。
      const bound = source.search(/setIntentHandler\(\s*createHostIntentHandler\(/);
      // 三端都把项目加载交给 SDK 组合层，处理器只在挂载成功后接线。
      const loaded = source.indexOf('projectId: screenId');
      expect(bound, `${host} 未绑定意图处理器`).toBeGreaterThan(-1);
      expect(loaded, `${host} 未触发项目加载`).toBeGreaterThan(-1);
      expect(bound, `${host} 必须在 load 之后绑定意图处理器`).toBeGreaterThan(loaded);
      // 智能体要读到设计器当前目录（含在线物料包），而不是后端写死的那几种组件。
      expect(source, `${host} 未把设计器目录交给智能体`).toMatch(/catalog: \(\) =>/);
      expect(source, `${host} 未在卸载时解绑意图处理器`).toContain('setIntentHandler(undefined)');
      if (host !== 'vanilla-host') {
        const adapter = readFileSync(COMPOSITION_RUNTIMES[host], 'utf8');
        expect(source).toContain('<BaseScreenDesigner');
        expect(adapter).toContain('loadHostRuntime()');
        expect(adapter).not.toContain('adoptBaseScreenRuntime(');
        expect(adapter).not.toContain('createBaseScreenRuntime(');
        expect(adapter).not.toContain('createBaseScreenPluginManager(');
      }
    }
  });
});
