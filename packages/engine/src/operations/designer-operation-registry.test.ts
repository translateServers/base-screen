import { describe, expect, it, vi } from 'vitest';
import { DesignerOperationRegistry } from './designer-operation-registry.js';

describe('DesignerOperationRegistry', () => {
  it('uses one available and enabled state for every execution entry', () => {
    const execute = vi.fn();
    const registry = new DesignerOperationRegistry<{
      readonly available: boolean;
      readonly enabled: boolean;
    }>([
      {
        id: 'save',
        scope: 'global',
        label: '保存',
        tooltip: '保存项目',
        isAvailable: (context: { readonly available: boolean }) => context.available,
        isEnabled: (context: { readonly enabled: boolean }) => context.enabled,
        execute,
      },
    ]);

    expect(registry.getState('save', { available: false, enabled: true })).toMatchObject({
      available: false,
      enabled: false,
    });
    expect(registry.execute('save', { available: true, enabled: false })).toBe(false);
    expect(registry.execute('save', { available: true, enabled: true })).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('keeps a known disabled operation consumed by the caller', () => {
    const registry = new DesignerOperationRegistry([
      {
        id: 'publish',
        scope: 'global',
        label: '发布',
        tooltip: '发布项目',
        isAvailable: () => true,
        isEnabled: () => false,
        execute: vi.fn(),
      },
    ]);

    expect(registry.get('publish')).toBeDefined();
    expect(registry.execute('publish', undefined)).toBe(false);
  });

  it('rejects duplicate operation ids', () => {
    expect(
      () =>
        new DesignerOperationRegistry([
          {
            id: 'copy',
            scope: 'canvas',
            label: '复制',
            tooltip: '复制组件',
            isAvailable: () => true,
            isEnabled: () => true,
            execute: () => undefined,
          },
          {
            id: 'copy',
            scope: 'canvas',
            label: '复制',
            tooltip: '复制组件',
            isAvailable: () => true,
            isEnabled: () => true,
            execute: () => undefined,
          },
        ]),
    ).toThrow('Designer operation ids must be unique.');
  });
});
