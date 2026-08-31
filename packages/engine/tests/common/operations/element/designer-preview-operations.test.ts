import type { ScreenDocument, ScreenProjectEnvelope } from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createDesignerElementOperations,
  type DesignerElementOperationsHost,
} from '../../../../src/common/operations/element/designer-element-operations.js';

function documentValue(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  };
}

function projectValue(): ScreenProjectEnvelope {
  return {
    projectId: '1',
    revision: '1',
    name: '测试大屏',
    description: null,
    document: documentValue(),
    metadata: {},
  };
}

type HostOverrides = Partial<
  Pick<
    DesignerElementOperationsHost,
    | 'canEditPosition'
    | 'canEditSize'
    | 'canMutateSelection'
    | 'canSelectLayer'
    | 'getDocument'
    | 'getProject'
    | 'hasPreviewHandler'
    | 'openCoordinateEntry'
    | 'openSizeEntry'
    | 'reorderSelection'
    | 'selectLayer'
  >
>;

function createHost(overrides: HostOverrides): DesignerElementOperationsHost {
  return {
    getDocument: overrides.getDocument ?? (() => documentValue()),
    canUndo: () => false,
    canRedo: () => false,
    getSelection: () => ({ selectedComponentIds: [], focusedComponentId: null }),
    getProject: overrides.getProject ?? (() => undefined),
    getProjectPhase: () => 'ready',
    hasPreviewHandler: overrides.hasPreviewHandler ?? (() => false),
    isDirty: () => false,
    canPublish: () => false,
    hasProjectWorkspace: () => false,
    hasClipboard: () => false,
    canGroup: () => false,
    canUngroup: () => false,
    canEnterGroupEditing: () => false,
    canExitGroupEditing: () => false,
    canAlign: () => false,
    canDistribute: () => false,
    getToolMaterialTypes: () => undefined,
    getCatalog: () => undefined,
    getZoom: () => 1,
    undo: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    redo: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    reduceSelection: () => undefined,
    executeCommand: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    executeTransaction: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    copy: () => undefined,
    paste: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    group: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    ungroup: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    enterGroupEditing: () => false,
    exitGroupEditing: () => false,
    align: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    distribute: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    duplicate: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    setZoomCentered: () => undefined,
    resetViewport: () => undefined,
    isCanvasAidEnabled: () => false,
    toggleCanvasAid: () => undefined,
    isGuidesVisible: () => false,
    toggleGuides: () => undefined,
    isBorderGuidesEnabled: () => false,
    toggleBorderGuides: () => undefined,
    cycleWorkbenchMode: () => undefined,
    openProjectWorkspace: () => undefined,
    save: async () => ({ ok: true, value: projectValue(), diagnostics: [] }),
    publish: async () => ({ ok: true, value: projectValue(), diagnostics: [] }),
    retryLastProjectOperation: async () => ({ ok: true, value: projectValue(), diagnostics: [] }),
    cancelProjectOperation: () => undefined,
    setActiveTool: () => undefined,
    cancelGesture: () => undefined,
    canMutateSelection: overrides.canMutateSelection ?? (() => false),
    canEditPosition: overrides.canEditPosition ?? (() => false),
    canEditSize: overrides.canEditSize ?? (() => false),
    canSelectLayer: overrides.canSelectLayer ?? (() => false),
    canSetSelectionStatus: () => false,
    openCoordinateEntry: overrides.openCoordinateEntry ?? (() => undefined),
    openSizeEntry: overrides.openSizeEntry ?? (() => undefined),
    selectLayer: overrides.selectLayer ?? (() => undefined),
    deleteSelection: () => undefined,
    nudgeSelection: () => undefined,
    toggleSelectionStatus: () => undefined,
    reorderSelection: overrides.reorderSelection ?? (() => undefined),
    toggleHelpPanel: () => undefined,
    fitViewportToSelectionOrCanvas: () => undefined,
    exportFromOperation: () => undefined,
    openImportPicker: () => undefined,
    togglePreview: () => ({ ok: true, value: undefined, diagnostics: [] }),
    isProjectBusy: () => false,
    report: () => undefined,
    reportProject: () => undefined,
    reportPreview: () => undefined,
  };
}

function previewState(host: DesignerElementOperationsHost): {
  available: boolean;
  enabled: boolean;
} {
  const operations = createDesignerElementOperations(host);
  const state = operations.find((operation) => operation.id === 'preview');
  return {
    available: state?.isAvailable(undefined) ?? false,
    enabled: state?.isEnabled(undefined) ?? false,
  };
}

describe('designer preview operation availability (ADR-0038)', () => {
  it('is available in direct document mode without a host preview handler', () => {
    expect(previewState(createHost({}))).toEqual({ available: true, enabled: true });
  });

  it('is unavailable in project mode without a host preview handler', () => {
    const state = previewState(
      createHost({ getProject: () => projectValue(), hasPreviewHandler: () => false }),
    );
    expect(state.enabled).toBe(false);
  });

  it('is available in project mode when a host preview handler is configured', () => {
    const state = previewState(
      createHost({ getProject: () => projectValue(), hasPreviewHandler: () => true }),
    );
    expect(state).toEqual({ available: true, enabled: true });
  });

  it('is disabled when there is no document regardless of mode', () => {
    const state = previewState(createHost({ getDocument: () => undefined }));
    expect(state.enabled).toBe(false);
  });
});

describe('designer coordinate entry operation', () => {
  it('exposes X and opens only while a valid position target is available', () => {
    const openCoordinateEntry = vi.fn();
    const enabled = createDesignerElementOperations(
      createHost({ canEditPosition: () => true, openCoordinateEntry }),
    ).find((operation) => operation.id === 'edit-position')!;

    expect(enabled.shortcut).toBe('X');
    expect(enabled.scope).toBe('canvas');
    expect(enabled.isEnabled(undefined)).toBe(true);
    enabled.execute(undefined);
    expect(openCoordinateEntry).toHaveBeenCalledOnce();

    const disabled = createDesignerElementOperations(
      createHost({ canEditPosition: () => false, openCoordinateEntry }),
    ).find((operation) => operation.id === 'edit-position')!;
    expect(disabled.isEnabled(undefined)).toBe(false);
  });
});

describe('designer size entry operation', () => {
  it('exposes W and opens only while a valid size target is available', () => {
    const openSizeEntry = vi.fn();
    const enabled = createDesignerElementOperations(
      createHost({ canEditSize: () => true, openSizeEntry }),
    ).find((operation) => operation.id === 'edit-size')!;

    expect(enabled.shortcut).toBe('W');
    expect(enabled.scope).toBe('canvas');
    expect(enabled.isEnabled(undefined)).toBe(true);
    enabled.execute(undefined);
    expect(openSizeEntry).toHaveBeenCalledOnce();

    const disabled = createDesignerElementOperations(
      createHost({ canEditSize: () => false, openSizeEntry }),
    ).find((operation) => operation.id === 'edit-size')!;
    expect(disabled.isEnabled(undefined)).toBe(false);
  });
});

describe('designer sibling layer shortcut operations', () => {
  it('maps brackets to one-step down and up selection actions', () => {
    const reorderSelection = vi.fn();
    const operations = createDesignerElementOperations(
      createHost({ canMutateSelection: () => true, reorderSelection }),
    );
    const down = operations.find((operation) => operation.id === 'send-backward')!;
    const up = operations.find((operation) => operation.id === 'bring-forward')!;

    expect(down.shortcut).toBe('[');
    expect(up.shortcut).toBe(']');
    expect(down.isEnabled(undefined)).toBe(true);
    expect(up.isEnabled(undefined)).toBe(true);

    down.execute(undefined);
    up.execute(undefined);
    expect(reorderSelection.mock.calls).toEqual([['down'], ['up']]);
  });
});

describe('designer layer selection shortcut operations', () => {
  it('maps Alt brackets to repeatable, dynamically enabled canvas selection actions', () => {
    const selectLayer = vi.fn();
    const canSelectLayer = vi.fn((direction: 'up' | 'down') => direction === 'up');
    const operations = createDesignerElementOperations(createHost({ canSelectLayer, selectLayer }));
    const up = operations.find((operation) => operation.id === 'select-layer-up')!;
    const down = operations.find((operation) => operation.id === 'select-layer-down')!;

    expect(up).toMatchObject({ shortcut: 'Alt+]', scope: 'canvas', repeatable: true });
    expect(down).toMatchObject({ shortcut: 'Alt+[', scope: 'canvas', repeatable: true });
    expect(up.isEnabled(undefined)).toBe(true);
    expect(down.isEnabled(undefined)).toBe(false);
    up.execute(undefined);
    expect(selectLayer).toHaveBeenCalledWith('up');
    expect(canSelectLayer.mock.calls).toEqual([['up'], ['down']]);
  });
});
