import { describe, expect, it } from 'vitest';
import {
  applyDesignerDataState,
  type DesignerDataStateInput,
  deriveDesignerDataState,
} from '../../../src/browser/dom/dataset/designer-data-state.js';

function derive(overrides: Partial<DesignerDataStateInput>) {
  return deriveDesignerDataState({ configured: true, ...overrides });
}

describe('deriveDesignerDataState · 七态优先级', () => {
  it('未配置数据来源时压过其它一切信号', () => {
    expect(
      deriveDesignerDataState({
        configured: false,
        unavailable: 'port-missing',
        loading: true,
        failure: 'boom',
      }),
    ).toEqual({ state: 'unconfigured' });
  });

  it('unavailable 压过 readonly / loading / failed / empty', () => {
    expect(
      derive({
        unavailable: 'port-missing',
        readonly: 'locked',
        loading: true,
        failure: 'boom',
        empty: true,
      }),
    ).toEqual({ state: 'unavailable', reason: 'port-missing' });
  });

  it('readonly 压过 loading / failed / empty', () => {
    expect(derive({ readonly: 'document', loading: true, failure: 'boom' })).toEqual({
      state: 'readonly',
      reason: 'document',
    });
  });

  it('loading 压过 failed / empty', () => {
    expect(derive({ loading: true, failure: 'boom', empty: true })).toEqual({ state: 'loading' });
  });

  it('failed 带上诊断码，压过 empty', () => {
    expect(derive({ failure: 'HOST_RESOURCE_TIMEOUT', empty: true })).toEqual({
      state: 'failed',
      diagnosticCode: 'HOST_RESOURCE_TIMEOUT',
    });
  });

  it('empty 只在其它六态都不命中时出现', () => {
    expect(derive({ empty: true })).toEqual({ state: 'empty' });
  });

  it('无其它信号即 ready', () => {
    expect(derive({})).toEqual({ state: 'ready' });
  });

  it('unavailable 三种成因各自可辨', () => {
    expect(derive({ unavailable: 'port-missing' }).reason).toBe('port-missing');
    expect(derive({ unavailable: 'instance-missing' }).reason).toBe('instance-missing');
    expect(derive({ unavailable: 'denied' }).reason).toBe('denied');
  });

  it('readonly 三种成因各自可辨', () => {
    expect(derive({ readonly: 'document' }).reason).toBe('document');
    expect(derive({ readonly: 'host' }).reason).toBe('host');
    expect(derive({ readonly: 'locked' }).reason).toBe('locked');
  });

  it('同一份输入永远得到同一状态（互斥、无并存）', () => {
    const view = derive({ loading: true });
    expect(view.state).toBe('loading');
    expect(view.reason).toBeUndefined();
    expect(view.diagnosticCode).toBeUndefined();
  });
});

describe('applyDesignerDataState', () => {
  function node(): HTMLElement {
    return { dataset: {} } as unknown as HTMLElement;
  }

  it('写入 state 与 reason', () => {
    const target = node();
    applyDesignerDataState(target, { state: 'unavailable', reason: 'denied' });
    expect(target.dataset.state).toBe('unavailable');
    expect(target.dataset.stateReason).toBe('denied');
  });

  it('状态切换时清掉过期的 reason', () => {
    const target = node();
    applyDesignerDataState(target, { state: 'unavailable', reason: 'denied' });
    applyDesignerDataState(target, { state: 'ready' });
    expect(target.dataset.state).toBe('ready');
    expect(target.dataset.stateReason).toBeUndefined();
  });
});
