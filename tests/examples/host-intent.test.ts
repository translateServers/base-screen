import { readFileSync } from 'node:fs';
import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
    blueprint: { relations: [] },
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

/** 整屏作用域现在统一打 `/agent/act`；这个 helper 给"路由判定为生成"的响应形状。 */
function screenActResponse(candidate: unknown = componentDocument()): Response {
  return Response.json({
    kind: 'generate_screen',
    routedBy: 'rule',
    name: '作战室',
    document: candidate,
    mode: 'deterministic',
    imageCount: 0,
    catalogSource: 'client',
    materials: [],
  });
}

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
        patch: { dataValue: { kind: 'inline', value: '今晚开抢' } },
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
    expect(proposal?.commands).toEqual([
      { type: 'update-canvas', patch: { backgroundColor: '#87ceeb' } },
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
      { type: 'update-canvas', patch: { backgroundColor: '#16305c' } },
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

  it('never submits a whole-screen proposal built from an empty document', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => screenActResponse(document())),
    );
    const element = designer();

    const result = await handler(element)(request);

    expect(result.ok).toBe(false);
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });
});

describe('host intent candidate safety', () => {
  it('routes the screen scope through /agent/act and submits an unsaved proposal', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    const fetch = vi.fn(async () => screenActResponse());
    vi.stubGlobal('fetch', fetch);
    const element = designer();
    const before = element.getDocument();
    const controller = new AbortController();

    expect((await handler(element)(request, controller.signal)).ok).toBe(true);
    // 关键：不再直接打 /agent/candidate；动作由后端判定，宿主只负责编译。
    expect(fetch).toHaveBeenCalledExactlyOnceWith('http://api.test/agent/act', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: request.text,
        scope: 'screen',
        screenId: 'screen-test',
        canvas: { backgroundColor: '#000000', hasBackgroundImage: false },
        context: {
          canvas: {
            width: 1920,
            height: 1080,
            backgroundColor: '#000000',
            hasBackgroundImage: false,
          },
          componentCount: 0,
          types: [],
          selection: [],
          lockedCount: 0,
        },
      }),
      signal: controller.signal,
    });
    expect(element.submitChangeProposal).toHaveBeenCalledOnce();
    expect(element.getDocument()).toBe(before);
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
      const result = handler(element)(request, controller.signal);
      if (change === 'abort') controller.abort();
      if (change === 'document') element.getDocument.mockReturnValue(document());
      if (change === 'undo') element.dispatchEvent(new Event('base-screen-change'));
      if (change === 'unload') element.getDocument.mockReturnValue(undefined);
      if (change === 'pending') element.readPendingChange.mockReturnValue({ id: 'existing' });
      finish(screenActResponse());

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

      expect((await handler(element)(request, controller.signal)).ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      expect(element.submitChangeProposal).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid candidate document without submitting it', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => screenActResponse({ invalid: true })),
    );
    const element = designer();

    const result = await handler(element)(request);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(element.submitChangeProposal).not.toHaveBeenCalled();
  });

  it('explains why the deterministic fallback ran in the proposal rationale', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          kind: 'generate_screen',
          routedBy: 'rule',
          name: '作战室',
          document: componentDocument(),
          mode: 'deterministic',
          imageCount: 0,
          failure: 'AGENT_NOT_CONFIGURED',
        }),
      ),
    );
    const element = designer();

    expect((await handler(element)(request)).ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.title).toBe('智能体 · 生成一张作战室');
    expect(proposal?.origin).toEqual({ author: '智能体' });
    expect(proposal?.rationale).toContain('未配置模型');
    expect(proposal?.rationale).not.toContain('AGENT_NOT_CONFIGURED');
  });

  it('names the degradation count in the proposal rationale', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          kind: 'generate_screen',
          routedBy: 'model',
          name: '作战室',
          document: componentDocument(),
          mode: 'llm',
          imageCount: 0,
          warnings: [{ code: 'AGENT_BLOCK_ROWS_TRIMMED', message: '表格超过 8 行，已裁剪' }],
        }),
      ),
    );
    const element = designer();

    expect((await handler(element)(request)).ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    expect(proposal?.rationale).toContain('有 1 处降级：表格超过 8 行，已裁剪');
  });

  it('reports the failure even when the model still produced a screen', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          kind: 'generate_screen',
          routedBy: 'model',
          name: '作战室',
          document: componentDocument(),
          mode: 'llm',
          imageCount: 0,
          failure: 'AGENT_SPEC_INVALID',
        }),
      ),
    );
    const element = designer();

    expect((await handler(element)(request)).ok).toBe(true);
    const proposal = element.submitChangeProposal.mock.calls[0]?.[0];
    // 有产出不等于没出问题：failure 必须出现在理由里，而不是被「由模型生成」盖过去。
    expect(proposal?.rationale).toContain('模型输出未通过校验');
  });

  it('reports engine rejection without claiming success', async () => {
    vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: 'http://api.test' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => screenActResponse()),
    );
    const element = designer();
    element.submitChangeProposal.mockReturnValue({ ok: false, diagnostics: [], value: {} });

    const result = await handler(element)(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toContain('引擎拒绝');
  });
});

const HOSTS = ['vanilla-host', 'react-host', 'vue-host'] as const;
const EDITORS = {
  'vanilla-host': 'examples/vanilla-host/src/views/screen-edit.ts',
  'react-host': 'examples/react-host/src/components/screen-editor.tsx',
  'vue-host': 'examples/vue-host/src/components/ScreenEditor.vue',
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
      // 提案对着当前文档试算：绑定早于 load 会让第一次提交必被引擎拒绝。
      const loaded = source.indexOf('await element.load(screenId)');
      expect(bound, `${host} 未绑定意图处理器`).toBeGreaterThan(-1);
      expect(loaded, `${host} 未调用 element.load`).toBeGreaterThan(-1);
      expect(bound, `${host} 必须在 load 之后绑定意图处理器`).toBeGreaterThan(loaded);
      // 智能体要读到设计器当前目录（含在线物料包），而不是后端写死的那几种组件。
      expect(source, `${host} 未把设计器目录交给智能体`).toMatch(/catalog: \(\) =>/);
      expect(source, `${host} 未在卸载时解绑意图处理器`).toContain('setIntentHandler(undefined)');
    }
  });
});
