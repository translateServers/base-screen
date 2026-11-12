import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import {
  BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT,
  BaseScreenDesignerElement,
  type BaseScreenProjectStateChangeEventDetail,
  type ScreenProjectState,
} from '../../../src/index.js';

const document = (): ScreenDocument => ({
  canvas: { width: 800, height: 600, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { relations: [] },
});

const envelope = (revision = 'rev-1', value = document()): ScreenProjectEnvelope => ({
  projectId: 'project-1',
  name: 'Project',
  revision,
  description: '不向公共状态投影的说明',
  metadata: { private: '不向公共状态投影的内容' },
  document: value,
});

function success(value: ScreenProjectEnvelope): ScreenParseResult<ScreenProjectEnvelope> {
  return { ok: true, value, diagnostics: [] };
}

function adapter(overrides: Partial<ScreenProjectAdapter> = {}): ScreenProjectAdapter {
  return {
    capabilities: { publish: false },
    load: vi.fn(async () => success(envelope())),
    save: vi.fn(async ({ document: value }) => success(envelope('rev-2', value))),
    ...overrides,
  };
}

function createDesigner(projectAdapter = adapter()) {
  const designer = new BaseScreenDesignerElement();
  const events: CustomEvent<BaseScreenProjectStateChangeEventDetail>[] = [];
  Object.assign(designer, {
    dispatchEvent: (event: CustomEvent<BaseScreenProjectStateChangeEventDetail>) => {
      if (event.type === BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT) {
        // 每次通知必须与同步 getter 读到的权威状态一致。
        expect(event.detail).toEqual(designer.getProjectState());
        events.push(event);
      }
      return true;
    },
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  expect(
    designer.configure({ catalog: createBaseScreenMaterialCatalog([]), projectAdapter }).ok,
  ).toBe(true);
  return { designer, events };
}

function ready(revision: string, dirty = false): ScreenProjectState {
  return {
    phase: 'ready',
    dirty,
    project: { projectId: 'project-1', name: 'Project', revision },
  };
}

describe('BaseScreenDesignerElement project state', () => {
  afterEach(() => vi.restoreAllMocks());

  it('公开初始、本地文档与卸载语义，支持晚订阅且快照不包含完整项目', async () => {
    const { designer, events } = createDesigner();
    expect(designer.getProjectState()).toEqual({ phase: 'unloaded', dirty: false, project: null });
    expect(events).toHaveLength(0);

    expect(designer.replaceDocument(document()).ok).toBe(true);
    expect(designer.getProjectState()).toEqual({ phase: 'ready', dirty: false, project: null });
    expect((await designer.load('project-1')).ok).toBe(true);
    expect(designer.getProjectState()).toEqual(ready('rev-1'));
    expect(events.at(-1)?.detail).toEqual(ready('rev-1'));
    expect(events.at(-1)?.bubbles).toBe(true);
    expect(events.at(-1)?.composed).toBe(true);
    expect(JSON.parse(JSON.stringify(designer.getProjectState()))).toEqual(ready('rev-1'));

    const first = designer.getProjectState();
    const second = designer.getProjectState();
    expect(first).not.toBe(second);
    expect(first.project).not.toBe(second.project);
    if (first.project === null) throw new Error('应已加载项目');
    Object.assign(first.project, { name: '被宿主修改', revision: '篡改', document: {} });
    Object.assign(first, { dirty: true });
    const eventState = events.at(-1)?.detail;
    if (eventState?.project === null || eventState === undefined) throw new Error('应有项目事件');
    Object.assign(eventState.project, { name: '被事件订阅者修改' });
    expect(designer.getProjectState()).toEqual(ready('rev-1'));

    designer.unload();
    expect(designer.getProjectState()).toEqual({ phase: 'unloaded', dirty: false, project: null });
    expect(events.at(-1)?.detail).toEqual(designer.getProjectState());
    expect(designer.getDocument()).toBeUndefined();
  });

  it('保存时 dirty 不变也通知新 revision，并覆盖编辑、撤销和重做', async () => {
    const { designer, events } = createDesigner();
    await designer.load('project-1');
    events.length = 0;
    await designer.save();
    expect(events.map(({ detail }) => detail)).toEqual([
      { ...ready('rev-1'), phase: 'saving' },
      ready('rev-2'),
    ]);

    expect(designer.setCanvasBackground({ type: 'solid', color: '#112233' }).ok).toBe(true);
    expect(designer.getProjectState()).toEqual(ready('rev-2', true));
    designer.undo();
    expect(events.at(-1)?.detail).toEqual(ready('rev-2'));
    designer.redo();
    expect(events.at(-1)?.detail).toEqual(ready('rev-2', true));
    await designer.save();
    expect(events.at(-1)?.detail).toEqual(ready('rev-2'));
  });

  it('连续编辑 dirty 状态不变时不重复通知或重绘项目控件', async () => {
    const { designer, events } = createDesigner();
    await designer.load('project-1');
    const renderProjectFeedback = vi.spyOn(
      getDesignerElementState(designer).projectFeedbackController,
      'render',
    );
    designer.setCanvasBackground({ type: 'solid', color: '#112233' });
    expect(events.at(-1)?.detail).toEqual(ready('rev-1', true));
    events.length = 0;
    renderProjectFeedback.mockClear();

    designer.setCanvasBackground({ type: 'solid', color: '#445566' });
    designer.undo();
    expect(designer.getProjectState()).toEqual(ready('rev-1', true));
    expect(events).toHaveLength(0);
    expect(renderProjectFeedback).not.toHaveBeenCalled();

    designer.undo();
    expect(events.map(({ detail }) => detail)).toEqual([ready('rev-1')]);
  });

  it('发布和取消操作沿用同一权威 phase 与 revision', async () => {
    const { designer, events } = createDesigner(
      adapter({
        capabilities: { publish: true },
        publish: vi.fn(async () => success(envelope('published'))),
      }),
    );
    await designer.load('project-1');
    events.length = 0;
    expect((await designer.publish()).ok).toBe(true);
    expect(events.map(({ detail }) => detail)).toEqual([
      { ...ready('rev-1'), phase: 'publishing' },
      ready('published'),
    ]);
    designer.cancelProjectOperation();
    expect(events.at(-1)?.detail).toEqual(ready('published'));
  });

  it('冲突保留本地权威项目，重新加载成功后投影远端元信息', async () => {
    const projectAdapter = adapter({
      save: vi.fn(
        async (): Promise<ScreenParseResult<ScreenProjectEnvelope>> => ({
          ok: false,
          diagnostics: [{ severity: 'error', code: 'PROJECT_CONFLICT', path: [], message: '冲突' }],
        }),
      ),
    });
    const { designer, events } = createDesigner(projectAdapter);
    await designer.load('project-1');
    designer.setCanvasBackground({ type: 'solid', color: '#112233' });
    await designer.save();
    expect(designer.getProjectState()).toEqual({ ...ready('rev-1', true), phase: 'conflict' });
    expect(events.at(-1)?.detail).toEqual(designer.getProjectState());
    expect((await designer.reloadRemote()).ok).toBe(false);
    expect(designer.getProjectState().phase).toBe('conflict');

    projectAdapter.load = vi.fn(async () => success({ ...envelope('rev-3'), name: 'Remote' }));
    expect((await designer.reloadRemote(true)).ok).toBe(true);
    expect(designer.getProjectState()).toEqual({
      ...ready('rev-3'),
      project: { projectId: 'project-1', name: 'Remote', revision: 'rev-3' },
    });
    expect(events.at(-1)?.detail).toEqual(designer.getProjectState());
    designer.unload();
    expect(events.at(-1)?.detail).toEqual({ phase: 'unloaded', dirty: false, project: null });
  });

  it('加载仍在飞行时只通知 loading，卸载后忽略迟到结果', async () => {
    let resolveLoad!: (value: ScreenParseResult<ScreenProjectEnvelope>) => void;
    const { designer, events } = createDesigner(
      adapter({ load: () => new Promise((resolve) => (resolveLoad = resolve)) }),
    );
    const loading = designer.load('project-1');
    expect(designer.getProjectState()).toEqual({ phase: 'loading', dirty: false, project: null });
    designer.unload();
    const count = events.length;
    resolveLoad(success(envelope()));
    expect((await loading).ok).toBe(false);
    expect(events).toHaveLength(count);
    expect(designer.getProjectState()).toEqual({ phase: 'unloaded', dirty: false, project: null });
  });

  it('保存飞行中继续编辑后 dirty 不变仍发布新 revision', async () => {
    let resolveSave!: (value: ScreenParseResult<ScreenProjectEnvelope>) => void;
    const save = vi.fn<ScreenProjectAdapter['save']>(
      () => new Promise((resolve) => (resolveSave = resolve)),
    );
    const { designer, events } = createDesigner(adapter({ save }));
    await designer.load('project-1');
    designer.setCanvasBackground({ type: 'solid', color: '#112233' });
    const submitted = designer.getDocument();
    const saving = designer.save();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    designer.setCanvasBackground({ type: 'solid', color: '#445566' });
    resolveSave(success(envelope('rev-2', submitted)));
    expect((await saving).ok).toBe(true);
    expect(events.at(-1)?.detail).toEqual(ready('rev-2', true));
    expect(designer.getProjectState()).toEqual(ready('rev-2', true));
  });

  it('服务端归一化文档提交失败时通知 error 并保留原项目 revision', async () => {
    const normalized = document();
    const { designer, events } = createDesigner(
      adapter({
        save: vi.fn(async () =>
          success(
            envelope('rev-2', { ...normalized, canvas: { ...normalized.canvas, width: 900 } }),
          ),
        ),
      }),
    );
    await designer.load('project-1');
    designer.setCanvasBackground({ type: 'solid', color: '#112233' });
    const before = designer.getDocument();
    events.length = 0;
    vi.spyOn(getDesignerElementState(designer).runtime, 'renderDocument').mockReturnValue({
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message: '失败' },
      ],
    });
    expect((await designer.save()).ok).toBe(false);
    expect(events.map(({ detail }) => detail)).toEqual([
      { ...ready('rev-1', true), phase: 'saving' },
      { ...ready('rev-1', true), phase: 'error' },
    ]);
    expect(designer.getProjectState()).toEqual(events.at(-1)?.detail);
    expect(designer.getDocument()).toBe(before);
  });

  it('adapter 加载成功但文档提交失败时不通知 ready 或暴露项目元信息', async () => {
    const { designer, events } = createDesigner();
    vi.spyOn(getDesignerElementState(designer).runtime, 'renderDocument').mockReturnValue({
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message: '失败' },
      ],
    });
    expect((await designer.load('project-1')).ok).toBe(false);
    expect(events.map(({ detail }) => detail)).toEqual([
      { phase: 'loading', dirty: false, project: null },
      { phase: 'error', dirty: false, project: null },
    ]);
    expect(designer.getProjectState()).toEqual(events.at(-1)?.detail);
  });
});
