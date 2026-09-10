import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenCorePluginDesignReadPort } from '../../../../src/common/operations/plugin/designer-plugin-design-read-port.js';

function designDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  } as unknown as ScreenDocument;
}

function selectionOf(...ids: string[]): ScreenInteractionState {
  return { selectedComponentIds: ids, focusedComponentId: ids[0] ?? null };
}

describe('createBaseScreenCorePluginDesignReadPort', () => {
  it('reads document and selection as one snapshot and hands out an immutable private copy', async () => {
    const document = designDocument();
    const port = createBaseScreenCorePluginDesignReadPort({
      getDocument: () => document,
      getSelection: () => selectionOf('title'),
    });

    const read = await port.read();
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.selectedComponentIds).toEqual(['title']);
    expect(read.value.focusedComponentId).toBe('title');
    expect(Object.isFrozen(read.value)).toBe(true);
    expect(Object.isFrozen(read.value.document.canvas)).toBe(true);
    // 严格模式下写入冻结快照会抛错，且绝不触及 canonical 文档。
    expect(() => {
      (read.value.document.canvas as { backgroundColor: string }).backgroundColor = '#000000';
    }).toThrow();
    expect(document.canvas.backgroundColor).toBe('#17212b');
  });

  it('re-reads live state instead of caching the first snapshot', async () => {
    let current = selectionOf('a');
    const port = createBaseScreenCorePluginDesignReadPort({
      getDocument: () => designDocument(),
      getSelection: () => current,
    });

    const first = await port.read();
    current = selectionOf('b');
    const second = await port.read();
    expect(first.ok && first.value.selectedComponentIds).toEqual(['a']);
    expect(second.ok && second.value.selectedComponentIds).toEqual(['b']);
  });

  it('fails closed before the designer has a document', async () => {
    const port = createBaseScreenCorePluginDesignReadPort({
      getDocument: () => undefined,
      getSelection: () => selectionOf(),
    });

    const read = await port.read();
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.diagnostics[0]?.code).toBe('PLUGIN_CORE_SESSION_INVALID');
    }
  });
});
