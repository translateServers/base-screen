import { describe, expect, it } from 'vitest';
import {
  evaluateScreenHostResourceParameters,
  extractScreenHostResourceVariableDependencies,
  validateScreenDataBinding,
  validateScreenHostResourceBinding,
} from '../../src/index.js';

/**
 * `data/host-dataset.ts` 现在只剩 re-export（实现已迁到 `data/value-ref.ts`）。
 *
 * 这里锁两件事：旧名字还能用、且**与 value-ref 的实现是同一份**（引用相等），
 * 防止有人在旧文件里重新长出一份求值逻辑。行为细节由 `tests/data/value-ref.test.ts` 覆盖。
 */
describe('host-dataset legacy entry points', () => {
  it('re-exports the value-ref implementations instead of duplicating them', () => {
    expect(validateScreenHostResourceBinding).toBe(validateScreenDataBinding);
  });

  it('keeps the legacy parameter helpers working for engine/renderer until T02c', () => {
    const params = {
      limit: { kind: 'literal' as const, value: 20 },
      tenant: { kind: 'variable' as const, variableId: 'tenant' },
    };
    expect(evaluateScreenHostResourceParameters(params, { tenant: 't-1' })).toEqual({
      ok: true,
      value: { params: { limit: 20, tenant: 't-1' }, dependencies: ['tenant'] },
      diagnostics: [],
    });
    expect(extractScreenHostResourceVariableDependencies(params)).toEqual(['tenant']);
  });
});
