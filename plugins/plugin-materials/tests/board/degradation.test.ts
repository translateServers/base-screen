import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  BOARD_DEGRADATION_FALLBACK,
  BOARD_DEGRADATION_TEXT,
  degradationText,
  shouldKeepFrame,
} from '../../src/board/board-degradation.js';

/**
 * 降级层是 8 个物料共享的失败语义（PRD §7.3 / §8.6），因此它的映射表与真值表必须
 * 可离线断言：文案错了会让值班员读到错误的故障原因，真值表错了会让「保留上次值」
 * 退化成「清屏」。
 */
describe('degradationText', () => {
  // PRD/架构点名的错误码一个都不能漏：漏了就会掉进兜底文案，屏上看不出是参数无效还是
  // 数据集不可用。
  const requiredCodes = [
    'HOST_RESOURCE_ACCESS_DENIED',
    'HOST_RESOURCE_UNAVAILABLE',
    'HOST_RESOURCE_TIMEOUT',
    'HOST_RESOURCE_FAILED',
    'HOST_RESOURCE_INVALID',
    'HOST_DATASET_INVALID',
    'HOST_DATASET_BINDING_INVALID',
    'HOST_DATASET_ADAPTER_FAILED',
    'HOST_DATASET_UNAVAILABLE',
    'HOST_DATASET_PARAMETER_INVALID',
    'HOST_DATASET_VARIABLE_INVALID',
  ] as const;

  it('maps every code named by the degradation contract to a short Chinese label', () => {
    for (const code of requiredCodes) {
      const text = degradationText(code);
      expect(text).not.toBe(BOARD_DEGRADATION_FALLBACK);
      expect(text.length).toBeGreaterThan(0);
      // 角标只有一行且不遮挡读数：文案必须短（≤ 8 字），且不含英文/标点。
      expect(text.length).toBeLessThanOrEqual(8);
      expect(/^[^A-Za-z]*$/u.test(text)).toBe(true);
    }
  });

  it('keeps the documented grouping of codes', () => {
    // 同一个原因的不同码给同一句话：屏上文案不该暴露基座内部的分码细节。
    expect(degradationText('HOST_RESOURCE_UNAVAILABLE')).toBe('数据源不可用');
    expect(degradationText('HOST_RESOURCE_TIMEOUT')).toBe('数据更新超时');
    expect(degradationText('HOST_DATASET_UNAVAILABLE')).toBe('数据集不可用');
    expect(degradationText('HOST_DATASET_PARAMETER_INVALID')).toBe('参数无效');
    expect(degradationText('HOST_DATASET_INVALID')).toBe('数据格式异常');
    expect(degradationText('HOST_DATASET_BINDING_INVALID')).toBe('绑定无效');
    expect(degradationText('HOST_DATASET_ADAPTER_FAILED')).toBe('投影失败');
    expect(degradationText('HOST_DATASET_VARIABLE_INVALID')).toBe('变量不可用');
  });

  // 冻结集里 `HOST_RESOURCE_FAILED` 同时覆盖「参数非法 / 数据集 404 / 宿主请求失败」
  // （渲染器先归一，物料看不到细分码）。因此它**不能**说成「数据源不可用」——那会让
  // 值班员以为断网。精确原因由宿主的 status 变量承载。
  it('does not blame the network for the collapsed failure code', () => {
    expect(degradationText('HOST_RESOURCE_FAILED')).toBe('数据更新失败');
    expect(degradationText('HOST_RESOURCE_FAILED')).not.toBe(
      degradationText('HOST_RESOURCE_UNAVAILABLE'),
    );
  });

  it('falls back to a generic label for unknown or empty codes', () => {
    expect(degradationText('SOMETHING_ELSE')).toBe(BOARD_DEGRADATION_FALLBACK);
    expect(degradationText('')).toBe(BOARD_DEGRADATION_FALLBACK);
    // 每个映射值都必须是非空字符串（表格里不允许留空占位）。
    expect(Object.values(BOARD_DEGRADATION_TEXT).every((text) => text.length > 0)).toBe(true);
  });
});

describe('shouldKeepFrame', () => {
  const idle: BaseScreenMaterialDataState = { status: 'idle' };
  const loading: BaseScreenMaterialDataState = { status: 'loading' };
  const ready: BaseScreenMaterialDataState = { status: 'ready', value: 42 };
  // 物料能收到的错误码是冻结集（`ScreenMaterialErrorCode`，8 个）；更细的
  // `HOST_DATASET_*` 码在渲染器边界已被归一，因此这里用真实可达的码举例。
  const error: BaseScreenMaterialDataState = {
    status: 'error',
    code: 'HOST_RESOURCE_FAILED',
    message: 'Host resource request failed.',
  };

  it('never keeps a frame before the first successful render', () => {
    // 首屏没有任何画面可保留：四种状态都必须落到 SDK 状态视图（占位/加载中/失败）。
    for (const state of [idle, loading, ready, error]) {
      expect(shouldKeepFrame(state, false)).toBe(false);
    }
  });

  it('keeps the last successful frame for every non-ready state', () => {
    expect(shouldKeepFrame(loading, true)).toBe(true);
    expect(shouldKeepFrame(idle, true)).toBe(true);
    expect(shouldKeepFrame(error, true)).toBe(true);
  });

  it('does not keep the frame when a fresh ready frame arrives', () => {
    // ready 态要换成新画面（由 commit() 就位），所以「保留」为 false。
    expect(shouldKeepFrame(ready, true)).toBe(false);
  });
});
