import { describe, expect, it } from 'vitest';
import type { Logger } from '../../examples/react-host/src/lib/logger';
import {
  createHostCatalogPort,
  HOST_VARIABLE_CLOCK,
  HOST_VARIABLE_NOTICE,
  HOST_VARIABLE_STATUS,
  noticeText,
  statusText,
} from '../../examples/react-host/src/screen/host-catalog-port';
import type {
  ScreenHostCatalogListRequest,
  ScreenHostCatalogResolveRequest,
} from '../../packages/contracts/src/index.js';

/**
 * 来源目录端口的求值契约（PRD §9.1 A15b 的后继）：变量值来自数据源实例，
 * 实例失败时渲染器让变量沿用 `initialValue`。端口自己的责任是**不向运行时抛异常**，
 * 并让目录的 list / describe 与运行时的 resolve 使用同一份来源声明。
 *
 * 浏览器冒烟只走得到「变量正常求值」的路径；注入抛错需要单元层才能稳定复现。
 */

const neverAborted = new AbortController().signal;

function resolveRequest(
  overrides: Partial<ScreenHostCatalogResolveRequest> = {},
): ScreenHostCatalogResolveRequest {
  return {
    sourceId: HOST_VARIABLE_NOTICE,
    params: {},
    purpose: 'runtime',
    signal: neverAborted,
    ...overrides,
  };
}

function listRequest(
  overrides: Partial<ScreenHostCatalogListRequest> = {},
): ScreenHostCatalogListRequest {
  return {
    query: '',
    limit: 50,
    signal: neverAborted,
    ...overrides,
  };
}

function fakeLogger(): Logger & { readonly warnings: readonly unknown[][] } {
  const warnings: unknown[][] = [];
  return {
    warnings,
    debug: () => {},
    info: () => {},
    warn: (...args: readonly unknown[]) => warnings.push([...args]),
    error: () => {},
  };
}

describe('host catalog port · 来源求值不得向运行时抛异常（A15b）', () => {
  it.each([
    ['clock', HOST_VARIABLE_CLOCK],
    ['notice', HOST_VARIABLE_NOTICE],
    ['status', HOST_VARIABLE_STATUS],
  ])('%s 源抛错时 resolve 返回失败而不是 reject', async (_label, sourceId) => {
    const boom = (): never => {
      throw new Error('source exploded');
    };
    const logger = fakeLogger();
    const port = createHostCatalogPort({
      clock: boom,
      noticeSource: boom,
      statusSource: boom,
      logger,
    });

    const result = await port.resolve(resolveRequest({ sourceId }));

    // 关键：promise 必须正常落定为失败结果；reject 会把整条实例链路打成异常。
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.diagnostics[0]?.code).toBe('HOST_RESOURCE_FAILED');
    expect(logger.warnings).toHaveLength(1);
  });

  it('已取消的请求直接返回空诊断，不去碰数据源', async () => {
    const controller = new AbortController();
    controller.abort();
    let touched = 0;
    const port = createHostCatalogPort({
      clock: () => {
        touched += 1;
        return new Date(0);
      },
    });

    const result = await port.resolve(
      resolveRequest({ sourceId: HOST_VARIABLE_CLOCK, signal: controller.signal }),
    );

    expect(result).toEqual({ ok: false, diagnostics: [] });
    expect(touched).toBe(0);
  });

  it('未声明的 sourceId 返回失败结果', async () => {
    const port = createHostCatalogPort();

    const result = await port.resolve(resolveRequest({ sourceId: 'production.unknown' }));

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.diagnostics[0]?.code).toBe('HOST_RESOURCE_FAILED');
  });
});

describe('host catalog port · 目录与运行时来自同一份声明', () => {
  it('list 按 query 过滤，并按 limit 分页', async () => {
    const port = createHostCatalogPort();

    const all = await port.list(listRequest());
    expect(all.ok ? all.value.items.map((item) => item.sourceId) : []).toEqual([
      HOST_VARIABLE_CLOCK,
      HOST_VARIABLE_NOTICE,
      HOST_VARIABLE_STATUS,
    ]);

    const filtered = await port.list(listRequest({ query: '告警' }));
    expect(filtered.ok ? filtered.value.items.map((item) => item.sourceId) : []).toEqual([
      HOST_VARIABLE_NOTICE,
    ]);

    const first = await port.list(listRequest({ limit: 2 }));
    expect(first.ok ? first.value.items.length : 0).toBe(2);
    expect(first.ok ? first.value.nextCursor : undefined).toBe('2');

    const next = await port.list(listRequest({ limit: 2, cursor: '2' }));
    expect(next.ok ? next.value.items.map((item) => item.sourceId) : []).toEqual([
      HOST_VARIABLE_STATUS,
    ]);
    expect(next.ok ? next.value.nextCursor : undefined).toBeUndefined();
  });

  it('describe 给出可预览的只读来源，未知来源失败关闭', async () => {
    const port = createHostCatalogPort();

    const known = await port.describe({ sourceId: HOST_VARIABLE_CLOCK, signal: neverAborted });
    expect(known.ok ? known.value : undefined).toMatchObject({
      sourceId: HOST_VARIABLE_CLOCK,
      parameters: [],
      readOnly: true,
      previewable: true,
    });

    const unknown = await port.describe({ sourceId: 'production.unknown', signal: neverAborted });
    expect(unknown.ok).toBe(false);
    expect(unknown.ok ? [] : unknown.diagnostics[0]?.code).toBe('HOST_VARIABLE_DESCRIPTOR_INVALID');
  });
});

describe('host catalog port · 正常求值', () => {
  it('clock 输出 HH:MM:SS（零填充，与 locale 无关）', async () => {
    const port = createHostCatalogPort({ clock: () => new Date(2026, 0, 2, 3, 4, 5) });

    const result = await port.resolve(resolveRequest({ sourceId: HOST_VARIABLE_CLOCK }));

    expect(result.ok ? result.value : null).toBe('03:04:05');
  });

  it('notice 优先 critical，其次 warning，都没有时给固定文案', () => {
    expect(
      noticeText([
        { level: 'info', deviceName: 'A', message: 'i' },
        { level: 'warning', deviceName: 'B', message: 'w' },
        { level: 'critical', deviceName: 'C', message: 'c' },
      ]),
    ).toBe('严重告警：C c');
    expect(noticeText([{ level: 'warning', deviceName: 'B', message: 'w' }])).toBe('一般告警：B w');
    expect(noticeText([])).toBe('本班无重大异常');
  });

  it('status 在线只给四字，离线给次数与最近时刻', () => {
    expect(statusText({ online: true, failures: 0, lastFailureAt: undefined })).toBe('数据源在线');
    expect(statusText({ online: false, failures: 3, lastFailureAt: undefined })).toBe(
      '数据源离线 · 3 次失败',
    );
    expect(
      statusText({
        online: false,
        failures: 1,
        lastFailureAt: new Date(2026, 0, 2, 3, 4, 5).getTime(),
      }),
    ).toBe('数据源离线 · 1 次失败 · 最近 03:04:05');
  });

  it('notice 超长文案按字符截断并加省略号（不会切断多字节字符）', () => {
    const long = 'x'.repeat(200);
    const text = noticeText([{ level: 'critical', deviceName: '设备', message: long }]);

    expect([...text].length).toBe(121);
    expect(text.endsWith('…')).toBe(true);
  });
});
