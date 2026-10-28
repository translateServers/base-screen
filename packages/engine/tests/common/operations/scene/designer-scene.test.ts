import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  prepareDesignerScenePreview,
  sceneLabel,
} from '../../../../src/common/operations/scene/designer-scene.js';

function textComponent(): ScreenComponentNode {
  return {
    id: 'title',
    type: 'base.text',
    name: '标题',
    parentId: null,
    position: { x: 40, y: 32 },
    size: { width: 320, height: 56 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: { text: '经营总览' },
    style: { color: '#17212b', fontSize: 32 },
    dataSource: null,
  };
}

function screenDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#ffffff' },
    components: [textComponent()],
    variables: [],
    blueprint: { relations: [] },
  };
}

const scene = { id: 'emergency', label: '应急指挥' };

describe('prepareDesignerScenePreview', () => {
  it('compiles the host commands into a candidate without touching the document', () => {
    const document = screenDocument();
    const result = prepareDesignerScenePreview(document, scene, {
      commands: [
        { type: 'update-canvas', patch: { backgroundColor: '#101010' } },
        {
          type: 'update-components',
          componentIds: ['title'],
          patch: { position: { x: 64, y: 32 } },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidate.canvas.backgroundColor).toBe('#101010');
    expect(result.value.candidate.components[0]?.position.x).toBe(64);
    expect(document.canvas.backgroundColor).toBe('#ffffff');
    expect(document.components[0]?.position.x).toBe(40);
    expect(result.value.provenance).toEqual({
      source: 'manual',
      label: sceneLabel('应急指挥'),
    });
  });

  it('rejects an empty command list', () => {
    expect(prepareDesignerScenePreview(screenDocument(), scene, { commands: [] })).toEqual({
      ok: false,
      diagnostics: [],
    });
  });

  it('rejects commands that produce no document difference', () => {
    const result = prepareDesignerScenePreview(screenDocument(), scene, {
      commands: [{ type: 'update-canvas', patch: { width: 960, height: 540 } }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid command with diagnostics', () => {
    const result = prepareDesignerScenePreview(screenDocument(), scene, {
      commands: [{ type: 'update-components', componentIds: ['missing'], patch: { rotation: 10 } }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
