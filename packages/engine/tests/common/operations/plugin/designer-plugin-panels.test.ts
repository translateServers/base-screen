import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  createDesignerPluginPanelModel,
  designerPluginPanelModelKey,
  listDesignerPluginPanels,
  resolveDesignerPluginPanelAction,
} from '../../../../src/common/operations/plugin/designer-plugin-panels.js';

function panelDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
    components: [{ id: 'title', type: 'base.text', position: { x: 80, y: 80 } }],
    variables: [],
    blueprint: { rules: [] },
  } as unknown as ScreenDocument;
}

describe('resolveDesignerPluginPanelAction', () => {
  it('accepts a matching panel action and forwards its args', () => {
    const resolved = resolveDesignerPluginPanelAction('acme.monitor', {
      panelId: 'acme.monitor',
      commandId: 'acme.nudge',
      args: { step: 40 },
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value).toEqual({ commandId: 'acme.nudge', args: { step: 40 } });
    }
  });

  it('rejects an action that claims another panel identity', () => {
    const resolved = resolveDesignerPluginPanelAction('acme.monitor', {
      panelId: 'acme.other',
      commandId: 'acme.nudge',
      args: null,
    });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.diagnostics[0]?.code).toBe('PLUGIN_CORE_COMMAND_UNAUTHORIZED');
      expect(resolved.diagnostics[0]?.path).toEqual(['panelId']);
    }
  });

  it('rejects malformed details before touching the command path', () => {
    for (const detail of [
      null,
      'acme.nudge',
      { panelId: 'acme.monitor', commandId: 'acme.nudge' },
      { panelId: 'acme.monitor', commandId: 'bad id', args: null },
      { panelId: 'acme.monitor', commandId: 'acme.nudge', args: null, extra: 1 },
    ]) {
      expect(resolveDesignerPluginPanelAction('acme.monitor', detail).ok).toBe(false);
    }
  });
});

describe('designer plugin panel model', () => {
  it('hands the panel a frozen private copy of the document', () => {
    const source = panelDocument();
    const model = createDesignerPluginPanelModel(source, {
      selectedComponentIds: ['title'],
      focusedComponentId: 'title',
    });

    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.document.canvas)).toBe(true);
    expect(model.selectedComponentIds).toEqual(['title']);
    expect(() => {
      (model.document.canvas as { backgroundColor: string }).backgroundColor = '#000000';
    }).toThrow();
    expect(source.canvas.backgroundColor).toBe('#17212b');
  });

  it('changes the model key only when document generation or selection changes', () => {
    const selection = { selectedComponentIds: ['title'], focusedComponentId: 'title' };
    const key = designerPluginPanelModelKey(3, selection);

    expect(designerPluginPanelModelKey(3, selection)).toBe(key);
    expect(designerPluginPanelModelKey(4, selection)).not.toBe(key);
    expect(
      designerPluginPanelModelKey(3, {
        selectedComponentIds: ['title', 'subtitle'],
        focusedComponentId: 'title',
      }),
    ).not.toBe(key);
    expect(
      designerPluginPanelModelKey(3, { selectedComponentIds: [], focusedComponentId: null }),
    ).not.toBe(key);
  });

  it('lists panels in stable order and tolerates an absent catalog', () => {
    expect(listDesignerPluginPanels(undefined)).toEqual([]);
    const entries = [
      {
        pluginId: 'acme.b',
        contribution: { kind: 'panel', id: 'b', name: 'B', tagName: 'acme-b' },
      },
      {
        pluginId: 'acme.a',
        contribution: { kind: 'panel', id: 'a', name: 'A', tagName: 'acme-a' },
      },
    ] as never[];
    const catalog = {
      get: () => undefined,
      has: () => false,
      list: () => entries,
    } as never;

    expect(listDesignerPluginPanels(catalog).map((entry) => entry.contribution.id)).toEqual([
      'b',
      'a',
    ]);
  });
});
