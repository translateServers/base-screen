import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  listDesignerArtboardComponentIds,
  projectDesignerArtboard,
  readDesignerArtboardOf,
} from '../../../src/common/session/designer-artboard.js';
import { DesignerSession } from '../../../src/common/session/designer-session.js';

const popup = {
  id: 'detail',
  name: '告警详情',
  display: 'popup' as const,
  width: 640,
  height: 400,
  backgroundColor: '#141c2b',
  borderRadius: 8,
  maskColor: 'rgba(0, 0, 0, 0.6)',
  closeOnMaskClick: true,
  closeOnEscape: true,
};

function component(id: string, extra: Partial<ScreenComponentNode> = {}): ScreenComponentNode {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...extra,
  };
}

function screen(): ScreenDocument {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    subCanvases: [popup, { id: 'security', name: '安防', display: 'page' as const }],
    components: [
      component('main'),
      component('panel', { canvasId: 'detail' }),
      component('camera', { canvasId: 'security' }),
      component('label', { parentId: 'panel' }),
    ],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

function createSession() {
  const rendered: ScreenDocument[] = [];
  const artboards: (string | null)[] = [];
  const session = new DesignerSession({
    renderDocument: (document): ScreenParseResult<void> => {
      rendered.push(document);
      return { ok: true, value: undefined, diagnostics: [] };
    },
    renderInteraction: () => undefined,
    emitChange: () => undefined,
    emitSelectionChange: () => undefined,
    onProjectChange: () => undefined,
    onDirtyChange: () => undefined,
    onConflict: () => undefined,
    onReady: () => undefined,
    onArtboardChange: (artboard) => artboards.push(artboard),
  });
  return { session, rendered, artboards };
}

describe('designer artboards (ADR-0109)', () => {
  it('projects a popup as the canvas and hides and locks components of other artboards', () => {
    const view = projectDesignerArtboard(screen(), 'detail');
    expect(view.document.canvas).toEqual({
      width: 640,
      height: 400,
      backgroundColor: '#141c2b',
    });
    expect([...view.outside]).toEqual(['main', 'camera']);
    expect(view.document.components[0]?.status).toEqual({ hidden: true, locked: true });
    expect(readDesignerArtboardOf(view.document)).toBe('detail');
    expect([...listDesignerArtboardComponentIds(view.document)]).toEqual(['panel', 'label']);
    const main = projectDesignerArtboard(screen(), null);
    expect([...main.outside]).toEqual(['panel', 'camera', 'label']);
    expect(readDesignerArtboardOf(main.document)).toBeNull();
  });

  it('edits the current popup through the view and writes back to the full document', () => {
    const { session, rendered, artboards } = createSession();
    expect(session.replaceDocument(screen()).ok).toBe(true);
    expect(session.setArtboard('detail').ok).toBe(true);
    expect(artboards).toEqual(['detail']);
    expect(rendered.at(-1)?.canvas.width).toBe(640);

    const added = session.executeTransaction({
      commands: [{ type: 'add-component', component: component('chart') }],
    });
    expect(added.ok).toBe(true);
    expect(session.fullDocument?.components.find((item) => item.id === 'chart')?.canvasId).toBe(
      'detail',
    );

    const resized = session.executeTransaction({
      commands: [{ type: 'update-canvas', patch: { width: 800 } }],
    });
    expect(resized.ok).toBe(true);
    expect(session.fullDocument?.canvas.width).toBe(1920);
    expect(session.fullDocument?.subCanvases?.[0]).toMatchObject({ width: 800 });
    // 画板外组件的状态保持原样，不会被视图里的隐藏锁定写回。
    expect(session.fullDocument?.components[0]?.status).toEqual({ hidden: false, locked: false });

    // 混合事务只作用于当前画板：画板外组件被摘掉。
    const mixed = session.executeTransaction({
      commands: [
        { type: 'update-components', componentIds: ['main', 'panel'], patch: { name: 'x' } },
      ],
    });
    expect(mixed.ok).toBe(true);
    expect(session.fullDocument?.components.find((item) => item.id === 'main')?.name).toBe('main');
    expect(session.fullDocument?.components.find((item) => item.id === 'panel')?.name).toBe('x');

    // 全部指向画板外的事务（宿主按完整文档编写）作用于完整文档。
    const outside = session.executeTransaction({
      commands: [{ type: 'update-components', componentIds: ['main'], patch: { name: 'm' } }],
    });
    expect(outside.ok).toBe(true);
    expect(session.fullDocument?.components.find((item) => item.id === 'main')?.name).toBe('m');
  });

  it('falls back to the main canvas when the current popup disappears', () => {
    const { session, artboards } = createSession();
    session.replaceDocument(screen());
    session.setArtboard('detail');
    const removed = session.executeFullTransaction({
      commands: [
        { type: 'remove-components', componentIds: ['panel'] },
        {
          type: 'replace-sub-canvases',
          subCanvases: [{ id: 'security', name: '安防', display: 'page' }],
        },
      ],
    });
    expect(removed.ok).toBe(true);
    expect(session.artboard).toBeNull();
    expect(artboards).toEqual(['detail', null]);
    expect(session.undo().ok).toBe(true);
    expect(session.fullDocument?.subCanvases).toHaveLength(2);
    expect(session.setArtboard('missing').ok).toBe(false);
  });

  it('projects a page with the main canvas size and inherits or overrides its background', () => {
    const page = projectDesignerArtboard(screen(), 'security');
    expect(page.document.canvas).toEqual(screen().canvas);
    expect([...listDesignerArtboardComponentIds(page.document)]).toEqual(['camera']);
    const custom = projectDesignerArtboard(
      {
        ...screen(),
        subCanvases: [
          { id: 'security', name: '安防', display: 'page', backgroundColor: '#102030' },
        ],
        components: [component('camera', { canvasId: 'security' })],
      },
      'security',
    );
    expect(custom.document.canvas).toEqual({
      width: 1920,
      height: 1080,
      backgroundColor: '#102030',
    });
  });

  it('keeps the page background inherited unless the author changes it on the page artboard', () => {
    const { session } = createSession();
    session.replaceDocument(screen());
    session.setArtboard('security');
    const added = session.executeTransaction({
      commands: [{ type: 'add-component', component: component('gauge') }],
    });
    expect(added.ok).toBe(true);
    expect(session.fullDocument?.components.find((item) => item.id === 'gauge')?.canvasId).toBe(
      'security',
    );
    const page = () => session.fullDocument?.subCanvases?.find((item) => item.id === 'security');
    expect(page()).not.toHaveProperty('backgroundColor');
    // 页面尺寸恒随主画布：视图里改尺寸不写回。
    session.executeTransaction({ commands: [{ type: 'update-canvas', patch: { width: 800 } }] });
    expect(session.fullDocument?.canvas.width).toBe(1920);
    const recolored = session.executeTransaction({
      commands: [{ type: 'update-canvas', patch: { backgroundColor: '#223344' } }],
    });
    expect(recolored.ok).toBe(true);
    expect(page()).toMatchObject({ backgroundColor: '#223344' });
    expect(session.fullDocument?.canvas.backgroundColor).toBe('#000000');
  });

  it('routes move-components to the full document', () => {
    const { session } = createSession();
    session.replaceDocument(screen());
    session.setArtboard('security');
    const moved = session.executeTransaction({
      commands: [{ type: 'move-components', componentIds: ['camera'], canvasId: null }],
    });
    expect(moved.ok).toBe(true);
    expect(
      session.fullDocument?.components.find((item) => item.id === 'camera'),
    ).not.toHaveProperty('canvasId');
  });
});
