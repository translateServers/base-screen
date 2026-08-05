import { describe, expect, it, vi } from 'vitest';
import {
  DesignerOperationRegistry,
  shortcutFromKeyboardEvent,
} from '../../../src/common/operations/designer-operation-registry.js';

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

  it('R3 resolves keyboard shortcuts from the same operation metadata', () => {
    const registry = new DesignerOperationRegistry([
      {
        id: 'undo',
        scope: 'global',
        label: '撤销',
        tooltip: '撤销上一步操作',
        shortcut: 'Ctrl+Z',
        isAvailable: () => true,
        isEnabled: () => true,
        execute: vi.fn(),
      },
    ]);
    const shortcut = shortcutFromKeyboardEvent({
      key: 'z',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent);
    expect(registry.findByShortcut(shortcut ?? '')?.id).toBe('undo');
    // Alt modifier is now expressed in the shortcut string (e.g. Ctrl+Alt+L alignment).
    expect(
      shortcutFromKeyboardEvent({
        key: 'z',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: true,
      } as KeyboardEvent),
    ).toBe('Ctrl+Alt+Z');
  });

  it('R3 resolves registered aliases and normalizes Backspace to Delete', () => {
    const registry = new DesignerOperationRegistry([
      {
        id: 'redo',
        scope: 'global',
        label: '重做',
        tooltip: '重做上一步操作',
        shortcut: 'Ctrl+Shift+Z',
        aliases: ['Ctrl+Y'],
        isAvailable: () => true,
        isEnabled: () => true,
        execute: vi.fn(),
      },
    ]);
    expect(registry.findByShortcut('Ctrl+Y')?.id).toBe('redo');
    expect(
      shortcutFromKeyboardEvent({
        key: 'Backspace',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      } as KeyboardEvent),
    ).toBe('Delete');
  });
});
