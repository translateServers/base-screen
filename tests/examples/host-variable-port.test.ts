import { describe, expect, it } from 'vitest';
import type { Logger } from '../../examples/react-host/src/lib/logger';
import {
  createHostVariablePort,
  HOST_VARIABLE_CLOCK,
  HOST_VARIABLE_NOTICE,
  HOST_VARIABLE_STATUS,
  noticeText,
  statusText,
} from '../../examples/react-host/src/screen/host-variable-port';
import type { ScreenHostVariableRequest } from '../../packages/contracts/src/index.js';

/**
 * `variablePort` 的容错契约（PRD §9.1 A15b）：`resolveHostVariableBatch` 用 `Promise.all`
 * 聚合，**任一变量的 resolve() reject 就会让整批变成 undefined → 整屏空白**。
 * 因此端口必须自己吞掉所有异常并回落 `initialValue`：少一个状态文案可以接受，
 * 整块屏不渲染不可接受。
 *
 * 这个文件此前零覆盖：三端 smoke 只走得到「变量正常求值」的路径，注入抛错需要
 * 单元层才能稳定复现（浏览器里没有让 `production.*` 抛错的入口）。
 */

const neverAborted = new AbortController().signal;

function request(overrides: Partial<ScreenHostVariableRequest> = {}): ScreenHostVariableRequest {
  return {
    variableId: 'notice',
    sourceId: HOST_VARIABLE_NOTICE,
    sourceType: 'data-source',
    initialValue: '本班无重大异常',
    controlled: false,
    purpose: 'runtime',
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

describe('host variable port · 单个变量源抛错不得拖垮整屏（A15b）', () => {
  it.each([
    ['clock', HOST_VARIABLE_CLOCK],
    ['notice', HOST_VARIABLE_NOTICE],
    ['status', HOST_VARIABLE_STATUS],
  ])('%s 源抛错时 resolve 仍返回 ok + initialValue', async (_label, sourceId) => {
    const boom = (): never => {
      throw new Error('source exploded');
    };
    const logger = fakeLogger();
    const port = createHostVariablePort({
      clock: boom,
      noticeSource: boom,
      statusSource: boom,
      logger,
    });

    const result = await port.resolve(request({ sourceId, initialValue: '兜底文案' }));

    // 关键：必须 ok，而不是 failed —— reject 会让整批变量变成 undefined。
    expect(result.ok).toBe(true);
    expect(result.ok === true ? result.value : undefined).toBe('兜底文案');
    expect(logger.warnings).toHaveLength(1);
  });

  it('三个变量同时抛错时逐个回落，不影响彼此', async () => {
    const boom = (): never => {
      throw new Error('source exploded');
    };
    const port = createHostVariablePort({ clock: boom, noticeSource: boom, statusSource: boom });

    const results = await Promise.all([
      port.resolve(
        request({ variableId: 'clock', sourceId: HOST_VARIABLE_CLOCK, initialValue: '--:--:--' }),
      ),
      port.resolve(
        request({
          variableId: 'notice',
          sourceId: HOST_VARIABLE_NOTICE,
          initialValue: '本班无重大异常',
        }),
      ),
      port.resolve(
        request({
          variableId: 'status',
          sourceId: HOST_VARIABLE_STATUS,
          initialValue: '数据源在线',
        }),
      ),
    ]);

    expect(results.map((result) => (result.ok ? result.value : null))).toEqual([
      '--:--:--',
      '本班无重大异常',
      '数据源在线',
    ]);
  });

  it('已取消的请求直接回落，不去碰数据源', async () => {
    const controller = new AbortController();
    controller.abort();
    let touched = 0;
    const port = createHostVariablePort({
      clock: () => {
        touched += 1;
        return new Date(0);
      },
    });

    const result = await port.resolve(
      request({ sourceId: HOST_VARIABLE_CLOCK, signal: controller.signal }),
    );

    expect(result.ok ? result.value : null).toBe('本班无重大异常');
    expect(touched).toBe(0);
  });

  it('未声明的 sourceId 与 url-query 变量一律回落 initialValue', async () => {
    const port = createHostVariablePort();

    expect(
      await port.resolve(request({ sourceId: 'production.unknown', initialValue: 'x' })),
    ).toEqual({
      ok: true,
      value: 'x',
      diagnostics: [],
    });
    expect(
      await port.resolve(
        request({ sourceType: 'url-query', sourceId: HOST_VARIABLE_CLOCK, initialValue: 'y' }),
      ),
    ).toEqual({ ok: true, value: 'y', diagnostics: [] });
  });
});

describe('host variable port · 正常求值', () => {
  it('clock 输出 HH:MM:SS（零填充，与 locale 无关）', async () => {
    const port = createHostVariablePort({ clock: () => new Date(2026, 0, 2, 3, 4, 5) });

    const result = await port.resolve(
      request({ sourceId: HOST_VARIABLE_CLOCK, initialValue: '--:--:--' }),
    );

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
